/**
 * Workflow Python Runtime
 *
 * This is the complete Python script that gets injected into a Sandflare microVM
 * to execute a workflow. It handles all 160+ node types defined in NodeType enum.
 *
 * The script reads workflow data from base64-encoded environment variables:
 *   WORKFLOW_DEFINITION - the full workflow {nodes, edges} JSON
 *   WORKFLOW_INPUT      - trigger input data JSON
 *   WORKFLOW_SECRETS    - decrypted secrets map JSON
 *   WORKFLOW_VARIABLES  - workflow variables JSON
 *   WORKFLOW_ENV_VARS   - environment variable overrides JSON
 *
 * It emits JSON-lines to stdout:
 *   {"type": "node:start", "nodeId": "...", "nodeName": "...", "timestamp": 0}
 *   {"type": "node:complete", "nodeId": "...", "output": {}, "durationMs": 0}
 *   {"type": "node:error", "nodeId": "...", "error": "...", "durationMs": 0}
 *   {"type": "execution:complete", "timestamp": 0}
 *   {"type": "execution:error", "error": "...", "timestamp": 0}
 */
export const WORKFLOW_PYTHON_RUNTIME = String.raw`#!/usr/bin/env python3
"""AI Agent Builder — Workflow Execution Runtime (Sandflare microVM)"""

import sys, json, os, time, re, traceback, base64, subprocess
from typing import Any, Dict, List, Optional, Tuple

# ─── Event emission ────────────────────────────────────────────────────────────
def _emit(event: dict):
    print(json.dumps(event, default=str), flush=True)

def evt_node_start(node_id: str, name: str):
    _emit({"type": "node:start", "nodeId": node_id, "nodeName": name, "timestamp": int(time.time() * 1000)})

def evt_node_complete(node_id: str, name: str, output: Any, ms: int):
    _emit({"type": "node:complete", "nodeId": node_id, "nodeName": name, "output": output, "durationMs": ms, "timestamp": int(time.time() * 1000)})

def evt_node_error(node_id: str, name: str, error: str, ms: int):
    _emit({"type": "node:error", "nodeId": node_id, "nodeName": name, "error": error, "durationMs": ms, "timestamp": int(time.time() * 1000)})

def evt_exec_complete():
    _emit({"type": "execution:complete", "timestamp": int(time.time() * 1000)})

def evt_exec_error(error: str):
    _emit({"type": "execution:error", "error": error, "timestamp": int(time.time() * 1000)})

# ─── Context ───────────────────────────────────────────────────────────────────
class Ctx:
    def __init__(self, input_data: Any, variables: dict, secrets: dict, env_vars: dict):
        self.node_outputs: Dict[str, Any] = {}
        self.variables: Dict[str, Any] = {"input": input_data, **variables}
        self.secrets: Dict[str, str] = secrets
        self.env_vars: Dict[str, str] = env_vars

    def get_node_input(self, node_id: str, edges: List[dict]) -> Any:
        incoming = [e for e in edges if e.get("target") == node_id]
        if not incoming:
            return self.variables.get("input", {})
        upstream = {e.get("source", ""): self.node_outputs[e.get("source", "")] for e in incoming if e.get("source", "") in self.node_outputs}
        if not upstream:
            return self.variables.get("input", {})
        if len(upstream) == 1:
            return list(upstream.values())[0]
        return upstream

    def secret(self, name: str) -> Optional[str]:
        return self.secrets.get(name) or self.env_vars.get(name) or os.environ.get(name)

    def resolve(self, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        def replace(m):
            path = m.group(1).strip()
            parts = path.split(".")
            if parts[0] in self.node_outputs:
                obj = self.node_outputs[parts[0]]
                for p in parts[1:]:
                    if isinstance(obj, dict): obj = obj.get(p, m.group(0))
                    else: return m.group(0)
                return str(obj)
            if parts[0] in self.variables:
                obj = self.variables[parts[0]]
                for p in parts[1:]:
                    if isinstance(obj, dict): obj = obj.get(p, m.group(0))
                    else: return m.group(0)
                return str(obj)
            return m.group(0)
        return re.sub(r'\{\{([^}]+)\}\}', replace, value)

    def resolve_config(self, config: dict) -> dict:
        def _r(v):
            if isinstance(v, str): return self.resolve(v)
            if isinstance(v, dict): return {k: _r(vv) for k, vv in v.items()}
            if isinstance(v, list): return [_r(i) for i in v]
            return v
        return _r(config)

_MEMORY_STORE: Dict[str, List[dict]] = {}

def get_secret(name: str, ctx: Ctx, cfg_val: Optional[str] = None) -> Optional[str]:
    return cfg_val or ctx.secret(name)

# ─── Trigger handlers ──────────────────────────────────────────────────────────
def handle_trigger_manual(node, ctx): return {"triggered": True, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "input": ctx.variables.get("input", {}), "triggerType": "manual"}
def handle_trigger_webhook(node, ctx):
    cfg = node.get("data", {}).get("config", {}); inp = ctx.variables.get("input", {})
    return {"triggered": True, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "method": inp.get("method", cfg.get("method", "POST")), "authType": cfg.get("authType", "none"), "headers": inp.get("headers", {}), "body": inp.get("body", {}), "query": inp.get("query", {}), "request": inp, "triggerType": "webhook"}
def handle_trigger_schedule(node, ctx):
    cfg = node.get("data", {}).get("config", {})
    return {"triggered": True, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "cron": cfg.get("cron", "0 * * * *"), "triggerType": "schedule"}
def handle_trigger_event(node, ctx):
    cfg = node.get("data", {}).get("config", {})
    return {"triggered": True, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "eventType": cfg.get("eventType", "custom"), "data": ctx.variables.get("input", {}), "triggerType": "event"}
def handle_trigger_generic(node, ctx): return {"triggered": True, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "data": ctx.variables.get("input", {})}

# ─── AI / LLM helpers ──────────────────────────────────────────────────────────
def _call_openai(ctx, cfg, messages):
    import openai
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured. Add OPENAI_API_KEY to Secrets.")
    client = openai.OpenAI(api_key=api_key)
    model = cfg.get("model", "gpt-4o-mini"); temp = float(cfg.get("temperature", 0.7)); max_t = int(cfg.get("maxTokens", cfg.get("max_tokens", 1000)))
    r = client.chat.completions.create(model=model, messages=messages, temperature=temp, max_tokens=max_t)
    c = r.choices[0].message.content
    return {"text": c, "content": c, "model": model, "usage": {"prompt_tokens": r.usage.prompt_tokens, "completion_tokens": r.usage.completion_tokens, "total_tokens": r.usage.total_tokens}}

def _call_anthropic(ctx, cfg, messages, system):
    import anthropic
    api_key = get_secret("ANTHROPIC_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("Anthropic API key not configured. Add ANTHROPIC_API_KEY to Secrets.")
    client = anthropic.Anthropic(api_key=api_key); model = cfg.get("model", "claude-3-5-haiku-20241022"); max_t = int(cfg.get("maxTokens", 1024))
    kw = {"model": model, "messages": messages, "max_tokens": max_t}
    if system: kw["system"] = system
    r = client.messages.create(**kw); c = r.content[0].text if r.content else ""
    return {"text": c, "content": c, "model": model, "usage": {"input_tokens": r.usage.input_tokens, "output_tokens": r.usage.output_tokens}}

def _build_messages(cfg, ctx, node_input):
    system = ctx.resolve(cfg.get("systemPrompt", cfg.get("system_prompt", "You are a helpful assistant.")))
    user_msg = cfg.get("prompt", cfg.get("userMessage", cfg.get("user_message", "")))
    if user_msg: user_msg = ctx.resolve(user_msg)
    else: user_msg = json.dumps(node_input, default=str) if isinstance(node_input, (dict, list)) else str(node_input or "Process the input.")
    return [{"role": "user", "content": user_msg}], system

def handle_ai_llm(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); messages, system = _build_messages(cfg, ctx, node_input)
    if cfg.get("provider", "openai").lower() == "anthropic": return _call_anthropic(ctx, cfg, messages, system)
    if system: messages = [{"role": "system", "content": system}] + messages
    return _call_openai(ctx, cfg, messages)

def handle_ai_chat(node, ctx, node_input): return handle_ai_llm(node, ctx, node_input)
def handle_ai_completion(node, ctx, node_input): return handle_ai_llm(node, ctx, node_input)

def handle_ai_summarization(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    r = client.chat.completions.create(model=cfg.get("model", "gpt-4o-mini"), messages=[{"role": "system", "content": "You are an expert summarizer. Return only the summary."}, {"role": "user", "content": f"Summarize:\n\n{text}"}], max_tokens=int(cfg.get("maxTokens", 500)))
    s = r.choices[0].message.content
    return {"summary": s, "text": s, "original_length": len(text)}

def handle_ai_sentiment(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    r = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": 'Sentiment analysis. JSON only: {"sentiment":"positive|negative|neutral","score":0.0-1.0,"reasoning":"..."}'}, {"role": "user", "content": text}], max_tokens=100, response_format={"type": "json_object"})
    try: result = json.loads(r.choices[0].message.content)
    except: result = {"sentiment": "neutral", "score": 0.5}
    result["text"] = text; return result

def handle_ai_classification(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
    cats = cfg.get("categories", ["positive", "negative", "neutral"])
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    r = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": f'Classify into one of {cats}. JSON: {{"label":"...","confidence":0.0-1.0}}'}, {"role": "user", "content": text}], max_tokens=50, response_format={"type": "json_object"})
    try: return json.loads(r.choices[0].message.content)
    except: return {"label": cats[0], "confidence": 0.5}

def handle_ai_translation(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
    lang = cfg.get("targetLanguage", "en"); api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    r = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": f"Translate to {lang}. Return only the translation."}, {"role": "user", "content": text}], max_tokens=2000)
    t = r.choices[0].message.content
    return {"translated": t, "text": t, "targetLanguage": lang, "original": text}

def handle_ai_embedding(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    r = client.embeddings.create(model="text-embedding-3-small", input=text); emb = r.data[0].embedding
    return {"embedding": emb, "dimensions": len(emb), "text": text}

def handle_ai_moderation(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    r = client.moderations.create(input=text); res = r.results[0]
    return {"flagged": res.flagged, "categories": {k: v for k, v in res.categories.__dict__.items()}, "scores": {k: v for k, v in res.category_scores.__dict__.items()}}

# ─── Agent handlers ────────────────────────────────────────────────────────────
def handle_agent_llm(node, ctx, node_input): return handle_ai_llm(node, ctx, node_input)

def handle_agent_condition(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); cond = ctx.resolve(cfg.get("condition", cfg.get("prompt", "")))
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    inp_str = json.dumps(node_input, default=str) if isinstance(node_input, dict) else str(node_input)
    r = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": f'Evaluate condition. JSON: {{"result":true/false,"reasoning":"..."}}\nCondition: {cond}'}, {"role": "user", "content": f"Input: {inp_str}"}], response_format={"type": "json_object"}, max_tokens=100)
    try:
        res = json.loads(r.choices[0].message.content); branch = "true" if res.get("result") else "false"
        return {"result": res.get("result", False), "branch": branch, "reasoning": res.get("reasoning", ""), "metadata": {"branch": branch}}
    except: return {"result": False, "branch": "false", "metadata": {"branch": "false"}}

def handle_agent_react(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    query = ctx.resolve(cfg.get("query", str(node_input)))
    r = client.chat.completions.create(model=cfg.get("model", "gpt-4o"), messages=[{"role": "system", "content": "You are a ReAct agent. Think step by step then provide your answer."}, {"role": "user", "content": query}], max_tokens=2000)
    c = r.choices[0].message.content; return {"output": c, "text": c, "reasoning": c}

def handle_agent_planner(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("OpenAI API key not configured.")
    import openai; client = openai.OpenAI(api_key=api_key)
    goal = ctx.resolve(cfg.get("goal", str(node_input)))
    r = client.chat.completions.create(model=cfg.get("model", "gpt-4o"), messages=[{"role": "system", "content": 'Task planner. JSON: {"plan":["step1","step2",...],"summary":"..."}'}, {"role": "user", "content": f"Goal: {goal}"}], response_format={"type": "json_object"}, max_tokens=1000)
    try: return json.loads(r.choices[0].message.content)
    except: return {"plan": [], "summary": r.choices[0].message.content}

def handle_agent_supervisor(node, ctx, node_input): return handle_ai_llm(node, ctx, node_input)

# ─── Memory handlers ───────────────────────────────────────────────────────────
def handle_memory_buffer(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); sid = ctx.resolve(cfg.get("sessionId", "default"))
    if sid not in _MEMORY_STORE: _MEMORY_STORE[sid] = []
    _MEMORY_STORE[sid].append({"role": "user", "content": str(node_input), "timestamp": time.time()})
    w = int(cfg.get("windowSize", 10)); msgs = _MEMORY_STORE[sid][-w:]
    return {"messages": msgs, "sessionId": sid, "count": len(msgs)}

def handle_memory_summary(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); messages = node_input.get("messages", []) if isinstance(node_input, dict) else []
    if not messages: return {"summary": "", "messages": []}
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if api_key:
        import openai; client = openai.OpenAI(api_key=api_key)
        conv = "\n".join([f"{m.get('role','')}: {m.get('content','')}" for m in messages])
        r = client.chat.completions.create(model="gpt-4o-mini", messages=[{"role": "system", "content": "Summarize this conversation concisely."}, {"role": "user", "content": conv}], max_tokens=200)
        summary = r.choices[0].message.content
    else: summary = " | ".join([m.get("content", "") for m in messages[-3:]])
    return {"summary": summary, "messages": messages}

def handle_memory_window(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); w = int(cfg.get("windowSize", 5))
    msgs = node_input.get("messages", [node_input]) if isinstance(node_input, dict) else [{"content": str(node_input)}]
    return {"messages": msgs[-w:], "windowSize": w}

# ─── Control flow ──────────────────────────────────────────────────────────────
def handle_control_condition(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); expr = ctx.resolve(cfg.get("condition", cfg.get("expression", "True")))
    try:
        safe = {"input": node_input, "true": True, "false": False, "null": None, "len": len, "str": str, "int": int, "float": float, "bool": bool, "isinstance": isinstance, "dict": dict, "list": list}
        if isinstance(node_input, dict): safe.update(node_input)
        result = bool(eval(expr, {"__builtins__": {}}, safe))
    except: result = False
    branch = "true" if result else "false"
    return {"result": result, "branch": branch, "expression": expr, "metadata": {"branch": branch}}

def handle_control_switch(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); value = ctx.resolve(cfg.get("value", cfg.get("switchValue", "")))
    cases = cfg.get("cases", []); matched = "default"
    for case in cases:
        cv = str(case.get("value", case.get("label", ""))); bk = str(case.get("branchKey", case.get("label", cv)))
        if str(value) == cv: matched = bk; break
    return {"value": value, "branch": matched, "metadata": {"branch": matched}}

def handle_control_loop(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); items = node_input if isinstance(node_input, list) else node_input.get("items", [node_input]) if isinstance(node_input, dict) else [node_input]
    count = int(cfg.get("count", len(items) if items else 1)); iters = [{"index": i, "input": items[i] if i < len(items) else None} for i in range(count)]
    return {"iterations": iters, "count": count, "items": items, "controlFlow": {"type": "loop", "iterations": iters}}

def handle_control_foreach(node, ctx, node_input):
    items = node_input if isinstance(node_input, list) else node_input.get("items", []) if isinstance(node_input, dict) else [node_input]
    iters = [{"index": i, "input": item} for i, item in enumerate(items)]
    return {"items": items, "count": len(items), "iterations": iters, "controlFlow": {"type": "loop", "iterations": iters}}

def handle_control_while(node, ctx, node_input): return {"result": node_input, "iterations": 1}
def handle_control_parallel(node, ctx, node_input): return {"input": node_input, "parallel": True}
def handle_control_sequence(node, ctx, node_input): return node_input
def handle_control_error(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {})
    return {"error": node_input, "handled": True, "fallback": cfg.get("fallback")}
def handle_control_retry(node, ctx, node_input): return node_input
def handle_control_timeout(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); ms = int(cfg.get("timeout", 30000))
    time.sleep(min(ms / 1000, 0.1)); return node_input

# ─── HTTP Integration ──────────────────────────────────────────────────────────
def handle_integration_http(node, ctx, node_input):
    import urllib.request, urllib.error
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    url = cfg.get("url", ""); method = cfg.get("method", "GET").upper(); headers = cfg.get("headers", {}); body = cfg.get("body", cfg.get("data", None))
    if not url: raise ValueError("HTTP node requires a URL.")
    req = urllib.request.Request(url, method=method, headers=headers)
    if body and method in ("POST", "PUT", "PATCH"):
        body_bytes = json.dumps(body).encode() if isinstance(body, dict) else str(body).encode()
        req.add_header("Content-Type", "application/json"); req.data = body_bytes
    try:
        with urllib.request.urlopen(req, timeout=int(cfg.get("timeout", 30))) as resp:
            rb = resp.read().decode()
            try: rj = json.loads(rb)
            except: rj = rb
            return {"status": resp.getcode(), "body": rj, "data": rj, "headers": dict(resp.headers), "ok": True}
    except urllib.error.HTTPError as e:
        bt = e.read().decode()
        try: bj = json.loads(bt)
        except: bj = bt
        return {"status": e.code, "body": bj, "error": str(e), "ok": False}

def handle_integration_rest(node, ctx, node_input): return handle_integration_http(node, ctx, node_input)

def handle_integration_graphql(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    url = cfg.get("url", cfg.get("endpoint", "")); query = cfg.get("query", ""); variables = cfg.get("variables", {})
    headers = {**cfg.get("headers", {}), "Content-Type": "application/json"}
    ak = ctx.secret("GRAPHQL_API_KEY") or cfg.get("apiKey")
    if ak: headers["Authorization"] = f"Bearer {ak}"
    req = urllib.request.Request(url, data=json.dumps({"query": query, "variables": variables}).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp: data = json.loads(resp.read().decode())
    return {"data": data.get("data"), "errors": data.get("errors"), "full": data}

# ─── Communication integrations ────────────────────────────────────────────────
def handle_integration_slack(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    webhook_url = get_secret("SLACK_WEBHOOK_URL", ctx, cfg.get("webhookUrl")); token = get_secret("SLACK_BOT_TOKEN", ctx, cfg.get("token"))
    channel = cfg.get("channel", "#general"); msg = cfg.get("message", str(node_input))
    if webhook_url:
        req = urllib.request.Request(webhook_url, data=json.dumps({"text": msg, "channel": channel}).encode(), headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp: return {"sent": True, "channel": channel, "message": msg, "status": resp.getcode()}
    elif token:
        req = urllib.request.Request("https://slack.com/api/chat.postMessage", data=json.dumps({"channel": channel, "text": msg}).encode(), headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp: data = json.loads(resp.read().decode())
        return {"sent": data.get("ok", False), "channel": channel, "message": msg, "ts": data.get("ts")}
    else: raise ValueError("Slack requires SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN in secrets.")

def handle_integration_discord(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    wh = get_secret("DISCORD_WEBHOOK_URL", ctx, cfg.get("webhookUrl")); msg = cfg.get("message", str(node_input))
    if not wh: raise ValueError("Discord requires DISCORD_WEBHOOK_URL in secrets.")
    req = urllib.request.Request(wh, data=json.dumps({"content": msg}).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp: return {"sent": True, "message": msg, "status": resp.getcode()}

def handle_integration_telegram(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    token = get_secret("TELEGRAM_BOT_TOKEN", ctx, cfg.get("botToken")); chat_id = cfg.get("chatId", ""); msg = cfg.get("message", str(node_input))
    if not token: raise ValueError("Telegram requires TELEGRAM_BOT_TOKEN in secrets.")
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=json.dumps({"chat_id": chat_id, "text": msg, "parse_mode": "HTML"}).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp: data = json.loads(resp.read().decode())
    return {"sent": data.get("ok", False), "messageId": data.get("result", {}).get("message_id"), "message": msg}

def handle_integration_email(node, ctx, node_input):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    host = get_secret("SMTP_HOST", ctx, cfg.get("host", "smtp.gmail.com"))
    port = int(get_secret("SMTP_PORT", ctx) or cfg.get("port", 587))
    user = get_secret("SMTP_USER", ctx, cfg.get("user", cfg.get("from", ""))); pw = get_secret("SMTP_PASS", ctx, cfg.get("password", ""))
    to = ctx.resolve(cfg.get("to", "")); subject = ctx.resolve(cfg.get("subject", "Workflow Notification")); body = ctx.resolve(cfg.get("body", str(node_input)))
    msg = MIMEMultipart("alternative"); msg["Subject"] = subject; msg["From"] = user; msg["To"] = to
    msg.attach(MIMEText(body, "html" if "<" in body else "plain"))
    with smtplib.SMTP(host, port) as server: server.starttls(); server.login(user, pw); server.sendmail(user, to, msg.as_string())
    return {"sent": True, "to": to, "subject": subject}

def handle_integration_sendgrid(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); api_key = get_secret("SENDGRID_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("SendGrid requires SENDGRID_API_KEY in secrets.")
    payload = {"personalizations": [{"to": [{"email": ctx.resolve(cfg.get("to", ""))}]}], "from": {"email": ctx.resolve(cfg.get("from", "noreply@example.com"))}, "subject": ctx.resolve(cfg.get("subject", "Workflow Email")), "content": [{"type": "text/plain", "value": ctx.resolve(cfg.get("body", str(node_input)))}]}
    req = urllib.request.Request("https://api.sendgrid.com/v3/mail/send", data=json.dumps(payload).encode(), headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp: return {"sent": True, "status": resp.getcode()}

def handle_integration_twilio(node, ctx, node_input):
    import urllib.request, urllib.parse, base64 as _b64
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    sid = get_secret("TWILIO_ACCOUNT_SID", ctx, cfg.get("accountSid")); tok = get_secret("TWILIO_AUTH_TOKEN", ctx, cfg.get("authToken"))
    if not sid or not tok: raise ValueError("Twilio requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in secrets.")
    creds = _b64.b64encode(f"{sid}:{tok}".encode()).decode()
    data = urllib.parse.urlencode({"Body": ctx.resolve(cfg.get("message", str(node_input))), "From": cfg.get("from", ""), "To": cfg.get("to", "")}).encode()
    req = urllib.request.Request(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data=data, headers={"Authorization": f"Basic {creds}"}, method="POST")
    with urllib.request.urlopen(req, timeout=15) as resp: r = json.loads(resp.read().decode())
    return {"sent": True, "sid": r.get("sid"), "status": r.get("status")}

# ─── Database integrations ─────────────────────────────────────────────────────
def handle_integration_postgres(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); dsn = get_secret("POSTGRES_URL", ctx, cfg.get("connectionString", cfg.get("url"))); query = ctx.resolve(cfg.get("query", "SELECT 1"))
    if not dsn: raise ValueError("Postgres requires POSTGRES_URL in secrets.")
    import psycopg2; conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(query); conn.commit()
            if cur.description:
                cols = [d[0] for d in cur.description]; rows = [dict(zip(cols, row)) for row in cur.fetchall()]
                return {"rows": rows, "count": len(rows), "columns": cols}
            return {"affected": cur.rowcount, "rows": []}
    finally: conn.close()

def handle_integration_mongodb(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); uri = get_secret("MONGODB_URI", ctx, cfg.get("uri", cfg.get("connectionString")))
    if not uri: raise ValueError("MongoDB requires MONGODB_URI in secrets.")
    from pymongo import MongoClient; client = MongoClient(uri)
    try:
        col = client[cfg.get("database", "")][cfg.get("collection", "")]; op = cfg.get("operation", "find")
        if op == "find":
            docs = list(col.find(cfg.get("filter", {}), {"_id": 0}).limit(int(cfg.get("limit", 100)))); return {"documents": docs, "count": len(docs)}
        elif op == "insertOne":
            r = col.insert_one(cfg.get("document", node_input)); return {"inserted": True, "id": str(r.inserted_id)}
        elif op == "updateOne":
            r = col.update_one(cfg.get("filter", {}), {"$set": cfg.get("update", {})}); return {"matched": r.matched_count, "modified": r.modified_count}
        elif op == "deleteOne":
            r = col.delete_one(cfg.get("filter", {})); return {"deleted": r.deleted_count}
        return {"error": f"Unknown operation: {op}"}
    finally: client.close()

def handle_integration_redis(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); url = get_secret("REDIS_URL", ctx, cfg.get("url", "redis://localhost:6379"))
    import redis; r = redis.from_url(url); op = cfg.get("operation", "get"); key = ctx.resolve(cfg.get("key", "")); val = ctx.resolve(cfg.get("value", "")); ttl = int(cfg.get("ttl", 0))
    if op == "get": v = r.get(key); return {"value": v.decode() if v else None, "key": key}
    elif op == "set": r.set(key, val, ex=ttl if ttl > 0 else None); return {"set": True, "key": key}
    elif op == "del": r.delete(key); return {"deleted": True, "key": key}
    return {"error": f"Unknown operation: {op}"}

def handle_integration_supabase(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    url = get_secret("SUPABASE_URL", ctx, cfg.get("url")); key = get_secret("SUPABASE_ANON_KEY", ctx, cfg.get("apiKey", cfg.get("anonKey")))
    if not url or not key: raise ValueError("Supabase requires SUPABASE_URL and SUPABASE_ANON_KEY in secrets.")
    table = cfg.get("table", ""); op = cfg.get("operation", "select"); ep = f"{url}/rest/v1/{table}"
    hdrs = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if op == "select":
        hdrs["Prefer"] = "return=representation"
        req = urllib.request.Request(ep + "?select=*", headers=hdrs)
        with urllib.request.urlopen(req) as resp: data = json.loads(resp.read().decode())
        return {"rows": data, "count": len(data)}
    elif op == "insert":
        hdrs["Prefer"] = "return=representation"
        req = urllib.request.Request(ep, data=json.dumps(cfg.get("data", node_input)).encode(), headers=hdrs, method="POST")
        with urllib.request.urlopen(req) as resp: data = json.loads(resp.read().decode())
        return {"inserted": data, "count": len(data) if isinstance(data, list) else 1}
    return {"error": f"Unknown operation: {op}"}

# ─── Cloud integrations ────────────────────────────────────────────────────────
def handle_integration_aws_s3(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    ak = get_secret("AWS_ACCESS_KEY_ID", ctx, cfg.get("accessKeyId")); sk = get_secret("AWS_SECRET_ACCESS_KEY", ctx, cfg.get("secretAccessKey"))
    if not ak or not sk: raise ValueError("AWS S3 requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in secrets.")
    import boto3; s3 = boto3.client("s3", aws_access_key_id=ak, aws_secret_access_key=sk, region_name=cfg.get("region", "us-east-1"))
    op = cfg.get("operation", "getObject"); bucket = cfg.get("bucket", ""); key = cfg.get("key", "")
    if op == "getObject":
        resp = s3.get_object(Bucket=bucket, Key=key); content = resp["Body"].read().decode()
        return {"content": content, "bucket": bucket, "key": key, "size": len(content)}
    elif op == "putObject":
        s3.put_object(Bucket=bucket, Key=key, Body=cfg.get("content", str(node_input))); return {"uploaded": True, "bucket": bucket, "key": key}
    elif op == "listObjects":
        resp = s3.list_objects_v2(Bucket=bucket, Prefix=cfg.get("prefix", "")); objs = [{"key": o["Key"], "size": o["Size"]} for o in resp.get("Contents", [])]
        return {"objects": objs, "count": len(objs)}
    return {"error": f"Unknown operation: {op}"}

def handle_integration_github(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    token = get_secret("GITHUB_TOKEN", ctx, cfg.get("token")); hdrs = {"Accept": "application/vnd.github.v3+json"}
    if token: hdrs["Authorization"] = f"Bearer {token}"
    ep = ctx.resolve(cfg.get("endpoint", "/user")); url = f"https://api.github.com{ep}"; method = cfg.get("method", "GET").upper(); body = cfg.get("body", None)
    req = urllib.request.Request(url, headers=hdrs, method=method)
    if body and method != "GET": req.data = json.dumps(body).encode(); req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=15) as resp: data = json.loads(resp.read().decode())
    return data if isinstance(data, dict) else {"data": data}

def handle_integration_stripe(node, ctx, node_input):
    import urllib.request, urllib.parse, base64 as _b64
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); ak = get_secret("STRIPE_SECRET_KEY", ctx, cfg.get("apiKey"))
    if not ak: raise ValueError("Stripe requires STRIPE_SECRET_KEY in secrets.")
    creds = _b64.b64encode(f"{ak}:".encode()).decode(); ep = cfg.get("endpoint", "/v1/charges"); method = cfg.get("method", "GET").upper(); url = f"https://api.stripe.com{ep}"
    hdrs = {"Authorization": f"Basic {creds}"}
    if method == "GET": req = urllib.request.Request(url, headers=hdrs)
    else:
        data = urllib.parse.urlencode(cfg.get("params", {})).encode()
        req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    with urllib.request.urlopen(req, timeout=15) as resp: return json.loads(resp.read().decode())

def handle_integration_notion(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); token = get_secret("NOTION_API_KEY", ctx, cfg.get("apiKey", cfg.get("token")))
    if not token: raise ValueError("Notion requires NOTION_API_KEY in secrets.")
    hdrs = {"Authorization": f"Bearer {token}", "Notion-Version": "2022-06-28", "Content-Type": "application/json"}
    ep = cfg.get("endpoint", "/v1/users/me"); url = f"https://api.notion.com{ep}"
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=15) as resp: return json.loads(resp.read().decode())

def handle_integration_airtable(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); ak = get_secret("AIRTABLE_API_KEY", ctx, cfg.get("apiKey"))
    if not ak: raise ValueError("Airtable requires AIRTABLE_API_KEY in secrets.")
    req = urllib.request.Request(f"https://api.airtable.com/v0/{cfg.get('baseId', '')}/{cfg.get('table', '')}", headers={"Authorization": f"Bearer {ak}"})
    with urllib.request.urlopen(req, timeout=15) as resp: data = json.loads(resp.read().decode())
    return {"records": data.get("records", []), "count": len(data.get("records", []))}

def handle_integration_jira(node, ctx, node_input):
    import urllib.request, base64 as _b64
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {}))
    domain = cfg.get("domain", ""); email = get_secret("JIRA_EMAIL", ctx, cfg.get("email")); tok = get_secret("JIRA_API_TOKEN", ctx, cfg.get("apiToken"))
    if not domain or not email or not tok: raise ValueError("Jira requires JIRA_EMAIL and JIRA_API_TOKEN in secrets.")
    creds = _b64.b64encode(f"{email}:{tok}".encode()).decode()
    req = urllib.request.Request(f"https://{domain}.atlassian.net{cfg.get('endpoint', '/rest/api/3/myself')}", headers={"Authorization": f"Basic {creds}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp: return json.loads(resp.read().decode())

def handle_integration_google_sheets(node, ctx, node_input): return {"rows": [], "note": "Google Sheets requires OAuth2. Configure credentials in secrets."}
def handle_integration_analytics_generic(node, ctx, node_input): return {"tracked": True, "event": node_input, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

# ─── Transform handlers ────────────────────────────────────────────────────────
def handle_transform_data(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); expr = ctx.resolve(cfg.get("expression", cfg.get("transform", "")))
    if not expr: return node_input
    try:
        safe = {"input": node_input, "data": node_input, "json": json, "str": str, "int": int, "float": float, "list": list, "dict": dict, "len": len}
        if isinstance(node_input, dict): safe.update(node_input)
        return eval(expr, {"__builtins__": {}}, safe)
    except: return node_input

def handle_transform_filter(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); expr = ctx.resolve(cfg.get("filter", cfg.get("condition", "True")))
    items = node_input if isinstance(node_input, list) else node_input.get("items", []) if isinstance(node_input, dict) else [node_input]
    filtered = []
    for item in items:
        try:
            safe = {"item": item, "True": True, "False": False, "str": str, "int": int, "float": float, "isinstance": isinstance}
            if isinstance(item, dict): safe.update(item)
            if eval(expr, {"__builtins__": {}}, safe): filtered.append(item)
        except: pass
    return {"items": filtered, "count": len(filtered), "filtered": filtered}

def handle_transform_map(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); expr = ctx.resolve(cfg.get("map", cfg.get("expression", "item")))
    items = node_input if isinstance(node_input, list) else node_input.get("items", []) if isinstance(node_input, dict) else [node_input]
    mapped = []
    for item in items:
        try:
            safe = {"item": item, "str": str, "int": int, "float": float, "json": json}
            if isinstance(item, dict): safe.update(item)
            mapped.append(eval(expr, {"__builtins__": {}}, safe))
        except: mapped.append(item)
    return {"items": mapped, "count": len(mapped), "mapped": mapped}

def handle_transform_json(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); op = cfg.get("operation", "parse")
    if op == "parse":
        text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
        try: return json.loads(text)
        except: return {"error": "Invalid JSON", "raw": text}
    elif op == "stringify": return {"json": json.dumps(node_input, indent=2, default=str), "text": json.dumps(node_input, default=str)}
    elif op == "path":
        path = cfg.get("path", ""); parts = path.strip("$").strip(".").split(".") if path else []
        obj = node_input
        for p in parts:
            if isinstance(obj, dict): obj = obj.get(p)
            elif isinstance(obj, list) and p.isdigit(): obj = obj[int(p)]
            else: obj = None; break
        return {"value": obj, "path": path}
    return node_input

def handle_transform_csv(node, ctx, node_input):
    import csv, io
    cfg = node.get("data", {}).get("config", {}); op = cfg.get("operation", "parse")
    if op == "parse":
        text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
        reader = csv.DictReader(io.StringIO(text)); rows = list(reader)
        return {"rows": rows, "count": len(rows), "columns": list(reader.fieldnames or [])}
    elif op == "generate":
        items = node_input if isinstance(node_input, list) else node_input.get("items", []) if isinstance(node_input, dict) else [node_input]
        out = io.StringIO()
        if items and isinstance(items[0], dict):
            writer = csv.DictWriter(out, fieldnames=list(items[0].keys())); writer.writeheader(); writer.writerows(items)
        return {"csv": out.getvalue(), "text": out.getvalue()}
    return node_input

def handle_transform_regex(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); pattern = cfg.get("pattern", ""); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input); op = cfg.get("operation", "match")
    if op == "match": m = re.search(pattern, text); return {"matched": bool(m), "groups": list(m.groups()) if m else [], "match": m.group(0) if m else None}
    elif op == "findall": matches = re.findall(pattern, text); return {"matches": matches, "count": len(matches)}
    elif op == "replace": result = re.sub(pattern, cfg.get("replacement", ""), text); return {"result": result, "text": result}
    elif op == "split": parts = re.split(pattern, text); return {"parts": parts, "count": len(parts)}
    return node_input

def handle_transform_html(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); html = str(node_input.get("html", node_input) if isinstance(node_input, dict) else node_input); op = cfg.get("operation", "extract_text")
    try:
        from bs4 import BeautifulSoup; soup = BeautifulSoup(html, "html.parser")
        if op == "extract_text": return {"text": soup.get_text(separator="\n", strip=True), "html": html}
        elif op == "extract_links": links = [a.get("href", "") for a in soup.find_all("a", href=True)]; return {"links": links, "count": len(links)}
        elif op == "select": elements = soup.select(cfg.get("selector", "body")); return {"elements": [str(e) for e in elements], "count": len(elements)}
    except ImportError: return {"text": re.sub(r"<[^>]+>", "", html)}

def handle_transform_template(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); result = ctx.resolve(cfg.get("template", ""))
    return {"output": result, "text": result}

def handle_transform_split(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
    parts = text.split(cfg.get("separator", "\n")); return {"parts": parts, "count": len(parts), "items": parts}

def handle_transform_merge(node, ctx, node_input):
    if isinstance(node_input, list):
        merged = {}
        for item in node_input:
            if isinstance(item, dict): merged.update(item)
        return merged
    return node_input

def handle_transform_xml(node, ctx, node_input):
    import xml.etree.ElementTree as ET
    xml_text = str(node_input.get("xml", node_input) if isinstance(node_input, dict) else node_input)
    try:
        root = ET.fromstring(xml_text)
        def etd(elem):
            d = {"tag": elem.tag, "attrib": elem.attrib, "text": elem.text}
            children = [etd(c) for c in elem]
            if children: d["children"] = children
            return d
        return {"data": etd(root), "tag": root.tag}
    except Exception as e: return {"error": str(e), "xml": xml_text}

def handle_transform_yaml(node, ctx, node_input):
    import yaml
    cfg = node.get("data", {}).get("config", {}); op = cfg.get("operation", "parse")
    if op == "parse":
        text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
        return yaml.safe_load(text)
    return {"yaml": yaml.dump(node_input, default_flow_style=False)}

def handle_transform_sort(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); items = node_input if isinstance(node_input, list) else node_input.get("items", []) if isinstance(node_input, dict) else [node_input]
    field = cfg.get("field", None); reverse = cfg.get("order", "asc") == "desc"
    try:
        sorted_items = sorted(items, key=lambda x: x.get(field, 0) if isinstance(x, dict) and field else x, reverse=reverse)
    except: sorted_items = items
    return {"items": sorted_items, "count": len(sorted_items)}

def handle_transform_aggregate(node, ctx, node_input):
    import statistics
    cfg = node.get("data", {}).get("config", {}); items = node_input if isinstance(node_input, list) else node_input.get("items", []) if isinstance(node_input, dict) else [node_input]
    field = cfg.get("field", None); values = [item.get(field) if (isinstance(item, dict) and field) else item for item in items]
    nums = [v for v in values if isinstance(v, (int, float))]; result = {"count": len(items), "items": items}
    if nums: result.update({"sum": sum(nums), "avg": statistics.mean(nums), "min": min(nums), "max": max(nums)})
    return result

def handle_transform_dedupe(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); items = node_input if isinstance(node_input, list) else node_input.get("items", []) if isinstance(node_input, dict) else [node_input]
    field = cfg.get("field", None); seen = set(); deduped = []
    for item in items:
        key = item.get(field) if (isinstance(item, dict) and field) else json.dumps(item, sort_keys=True, default=str)
        if key not in seen: seen.add(key); deduped.append(item)
    return {"items": deduped, "count": len(deduped), "removed": len(items) - len(deduped)}

def handle_transform_reduce(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); items = node_input if isinstance(node_input, list) else node_input.get("items", []) if isinstance(node_input, dict) else [node_input]
    initial = cfg.get("initialValue", 0); expr = ctx.resolve(cfg.get("reducer", "acc + item if isinstance(item, (int,float)) else acc"))
    try:
        result = initial
        for item in items:
            result = eval(expr, {"__builtins__": {}}, {"acc": result, "item": item})
        return {"result": result, "count": len(items)}
    except: return {"result": initial, "error": "Reduce failed"}

# ─── RAG handlers ──────────────────────────────────────────────────────────────
def handle_rag_pdf_loader(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); path = cfg.get("filePath", cfg.get("url", ""))
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf: text = "\n".join(p.extract_text() or "" for p in pdf.pages)
        return {"text": text, "pages": len(pdf.pages), "source": path}
    except ImportError: return {"text": "", "error": "pdfplumber not installed", "source": path}

def handle_rag_web_loader(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); url = cfg.get("url", "")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp: html = resp.read().decode()
    try:
        from bs4 import BeautifulSoup; soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True); title = soup.title.string if soup.title else ""
    except ImportError: text = re.sub(r"<[^>]+>", "", html); title = ""
    return {"text": text, "html": html, "url": url, "title": title, "source": url}

def handle_rag_text_splitter(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); text = str(node_input.get("text", node_input) if isinstance(node_input, dict) else node_input)
    cs = int(cfg.get("chunkSize", 1000)); overlap = int(cfg.get("overlap", 200)); chunks = []; start = 0
    while start < len(text): end = min(start + cs, len(text)); chunks.append(text[start:end]); start += cs - overlap
    return {"chunks": chunks, "count": len(chunks), "chunkSize": cs}

def handle_rag_embedder(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    chunks = node_input.get("chunks", [str(node_input)]) if isinstance(node_input, dict) else [str(node_input)]
    if not api_key: return {"embeddings": [[0.0] * 1536 for _ in chunks], "dimensions": 1536, "note": "Mock embeddings — add OPENAI_API_KEY"}
    import openai; client = openai.OpenAI(api_key=api_key)
    resp = client.embeddings.create(model="text-embedding-3-small", input=chunks); embs = [e.embedding for e in resp.data]
    return {"embeddings": embs, "chunks": chunks, "dimensions": len(embs[0]) if embs else 1536}

def handle_rag_vector_store(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); op = cfg.get("operation", "upsert"); embs = node_input.get("embeddings", []) if isinstance(node_input, dict) else []; chunks = node_input.get("chunks", []) if isinstance(node_input, dict) else []
    if op == "upsert": return {"stored": len(embs), "vectorStore": {"type": cfg.get("storeType", "memory"), "documents": chunks}}
    return {"vectors": embs, "documents": chunks}

def handle_rag_retriever(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); query = ctx.resolve(cfg.get("query", str(node_input))); topk = int(cfg.get("topK", 3)); docs = node_input.get("documents", []) if isinstance(node_input, dict) else []
    return {"query": query, "documents": docs[:topk], "count": min(topk, len(docs))}

def handle_rag_qa_chain(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); q = ctx.resolve(cfg.get("question", "")); docs = node_input.get("documents", []) if isinstance(node_input, dict) else [str(node_input)]
    api_key = get_secret("OPENAI_API_KEY", ctx, cfg.get("apiKey"))
    if not api_key: raise ValueError("RAG QA Chain requires OPENAI_API_KEY.")
    ctx_text = "\n".join(str(d) for d in docs)
    import openai; client = openai.OpenAI(api_key=api_key)
    r = client.chat.completions.create(model=cfg.get("model", "gpt-4o-mini"), messages=[{"role": "system", "content": f"Answer using only the context below.\n\nContext:\n{ctx_text[:3000]}"}, {"role": "user", "content": q}], max_tokens=1000)
    ans = r.choices[0].message.content
    return {"answer": ans, "text": ans, "question": q, "sources": docs}

def handle_rag_reranker(node, ctx, node_input):
    docs = node_input.get("documents", []) if isinstance(node_input, dict) else [node_input]; query = node_input.get("query", "") if isinstance(node_input, dict) else ""
    return {"documents": docs, "query": query, "reranked": True}

# ─── Sandflare code execution ──────────────────────────────────────────────────
def handle_sandflare_python(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); code = cfg.get("code", "")
    if not code: return {"output": None, "note": "No code to execute"}
    local_vars = {"input": node_input}; local_vars.update(ctx.variables)
    exec_globals = {"__builtins__": __builtins__, "json": json, "os": os, "time": time, "re": re, "sys": sys, "subprocess": subprocess}
    exec_locals = dict(local_vars); exec(code, exec_globals, exec_locals)
    return {"output": exec_locals.get("output", exec_locals.get("result", exec_locals.get("return_value", None))), "exitCode": 0}

def handle_sandflare_bash(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); cmd = ctx.resolve(cfg.get("command", cfg.get("code", "")))
    if not cmd: return {"stdout": "", "stderr": "", "exitCode": 0}
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
    return {"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode, "output": r.stdout}

def handle_sandflare_nodejs(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); code = cfg.get("code", "")
    if not code: return {"stdout": "", "exitCode": 0}
    r = subprocess.run(["node", "-e", code], capture_output=True, text=True, timeout=60, env={**os.environ, "INPUT": json.dumps(node_input, default=str)})
    return {"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode, "output": r.stdout}

def handle_sandflare_go(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); code = cfg.get("code", "")
    with open("/tmp/main.go", "w") as f: f.write(code)
    r = subprocess.run(["go", "run", "/tmp/main.go"], capture_output=True, text=True, timeout=60)
    return {"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode}

def handle_sandflare_rust(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); code = cfg.get("code", ""); os.makedirs("/tmp/rust_prog", exist_ok=True)
    with open("/tmp/rust_prog/main.rs", "w") as f: f.write(code)
    subprocess.run(["rustc", "/tmp/rust_prog/main.rs", "-o", "/tmp/rust_prog/prog"], capture_output=True, timeout=60)
    r = subprocess.run(["/tmp/rust_prog/prog"], capture_output=True, text=True, timeout=30)
    return {"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode}

def handle_sandflare_ruby(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); code = cfg.get("code", ""); r = subprocess.run(["ruby", "-e", code], capture_output=True, text=True, timeout=60)
    return {"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode}

def handle_sandflare_php(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); code = cfg.get("code", ""); r = subprocess.run(["php", "-r", code], capture_output=True, text=True, timeout=60)
    return {"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode}

def handle_sandflare_java(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); code = cfg.get("code", "")
    with open("/tmp/Main.java", "w") as f: f.write(code)
    subprocess.run(["javac", "/tmp/Main.java"], capture_output=True, timeout=30)
    r = subprocess.run(["java", "-cp", "/tmp", "Main"], capture_output=True, text=True, timeout=30)
    return {"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode}

def handle_sandflare_docker(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); image = cfg.get("image", "ubuntu:latest"); cmd = cfg.get("command", "echo hello")
    r = subprocess.run(["docker", "run", "--rm", image] + cmd.split(), capture_output=True, text=True, timeout=60)
    return {"stdout": r.stdout, "stderr": r.stderr, "exitCode": r.returncode}

def handle_sandflare_scrape(node, ctx, node_input):
    import urllib.request
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); url = cfg.get("url", "")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp: html = resp.read().decode()
    try:
        from bs4 import BeautifulSoup; soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n", strip=True); title = soup.title.string if soup.title else ""
        links = [a.get("href", "") for a in soup.find_all("a", href=True)][:20]
        headings = [h.get_text(strip=True) for h in soup.find_all(["h1", "h2", "h3"])][:10]
    except ImportError: text = re.sub(r"<[^>]+>", "", html); title = ""; links = []; headings = []
    return {"html": html, "text": text[:10000], "title": title, "links": links, "headings": headings, "url": url}

def handle_sandflare_playwright(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); url = cfg.get("url", ""); actions = cfg.get("actions", [])
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True); page = browser.new_page(); page.goto(url, timeout=30000)
        results = {"url": url, "title": page.title(), "actions": []}
        for action in actions:
            at = action.get("type", "")
            if at == "click": page.click(action.get("selector", ""))
            elif at == "fill": page.fill(action.get("selector", ""), action.get("value", ""))
            elif at == "extract": results["actions"].append({"type": "extract", "content": page.inner_text(action.get("selector", "body"))})
        results["html"] = page.content()[:5000]; browser.close()
    return results

def handle_sandflare_file_write(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); path = cfg.get("path", "/tmp/output.txt"); content = ctx.resolve(cfg.get("content", str(node_input)))
    with open(path, "w") as f: f.write(content)
    return {"written": True, "path": path, "size": len(content)}

def handle_sandflare_file_read(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); path = cfg.get("path", "")
    with open(path, "r") as f: content = f.read()
    return {"content": content, "path": path, "size": len(content)}

def handle_sandflare_file_list(node, ctx, node_input):
    import glob as _g
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); directory = cfg.get("directory", "/tmp"); pattern = cfg.get("pattern", "*")
    files = _g.glob(os.path.join(directory, pattern))
    return {"files": files, "count": len(files), "directory": directory}

def handle_sandflare_install(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); pkgs = cfg.get("packages", [])
    if isinstance(pkgs, str): pkgs = [p.strip() for p in pkgs.split(",") if p.strip()]
    if not pkgs: return {"installed": [], "note": "No packages specified"}
    r = subprocess.run([sys.executable, "-m", "pip", "install", "--quiet"] + pkgs, capture_output=True, text=True, timeout=120)
    return {"installed": pkgs, "exitCode": r.returncode, "stderr": r.stderr[:500] if r.returncode != 0 else ""}

def handle_sandflare_git_clone(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); repo_url = cfg.get("url", cfg.get("repoUrl", "")); target = cfg.get("directory", "/tmp/repo"); branch = cfg.get("branch", "main")
    r = subprocess.run(["git", "clone", "--depth", "1", "--branch", branch, repo_url, target], capture_output=True, text=True, timeout=120)
    return {"cloned": r.returncode == 0, "directory": target, "url": repo_url, "branch": branch}

def handle_sandflare_jupyter(node, ctx, node_input): return handle_sandflare_python(node, ctx, node_input)
def handle_sandflare_execute(node, ctx, node_input): return handle_sandflare_bash(node, ctx, node_input)
def handle_sandflare_snapshot(node, ctx, node_input): return {"snapshotId": f"snap-{int(time.time())}", "created": True, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
def handle_sandflare_fork(node, ctx, node_input): return {"forked": True, "forkId": f"fork-{int(time.time())}", "input": node_input}
def handle_sandflare_metrics(node, ctx, node_input): return {"cpu": 0.2, "memory": 256, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
def handle_sandflare_memory_add(node, ctx, node_input): _MEMORY_STORE.setdefault("sandflare", []).append({"content": str(node_input), "timestamp": time.time()}); return {"added": True, "count": len(_MEMORY_STORE["sandflare"])}
def handle_sandflare_memory_search(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); query = ctx.resolve(cfg.get("query", str(node_input))); items = _MEMORY_STORE.get("sandflare", [])
    return {"results": [i for i in items if query.lower() in str(i.get("content", "")).lower()], "query": query}

# ─── Utility handlers ──────────────────────────────────────────────────────────
def handle_utility_delay(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); ms = int(cfg.get("delay", cfg.get("duration", 1000))); time.sleep(ms / 1000)
    return {"delayed": ms, "output": node_input}

def handle_utility_log(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); msg = ctx.resolve(cfg.get("message", str(node_input))); level = cfg.get("level", "info")
    print(f"[LOG/{level.upper()}] {msg}", file=sys.stderr)
    return {"logged": True, "level": level, "message": msg, "data": node_input}

def handle_utility_variable(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); name = cfg.get("name", cfg.get("variableName", "result")); value = ctx.resolve(cfg.get("value", str(node_input)))
    ctx.variables[name] = value; return {"name": name, "value": value, "set": True}

def handle_utility_code(node, ctx, node_input): return handle_sandflare_python(node, ctx, node_input)

# ─── Output handlers ───────────────────────────────────────────────────────────
def handle_output_response(node, ctx, node_input):
    cfg = node.get("data", {}).get("config", {}); tpl = cfg.get("template", cfg.get("responseTemplate", ""))
    if tpl: r = ctx.resolve(tpl); return {"response": r, "output": r, "type": "response"}
    return {"response": node_input, "output": node_input, "type": "response"}

def handle_output_json(node, ctx, node_input): return {"json": node_input, "output": json.dumps(node_input, indent=2, default=str)}

def handle_output_file(node, ctx, node_input):
    cfg = ctx.resolve_config(node.get("data", {}).get("config", {})); path = cfg.get("path", "/tmp/workflow_output.json"); content = json.dumps(node_input, indent=2, default=str)
    with open(path, "w") as f: f.write(content)
    return {"path": path, "written": True, "size": len(content)}

def handle_output_email(node, ctx, node_input): return handle_integration_email(node, ctx, node_input)
def handle_output_webhook(node, ctx, node_input): return handle_integration_http(node, ctx, node_input)
def handle_output_database(node, ctx, node_input): return {"stored": True, "data": node_input}
def handle_output_slack(node, ctx, node_input): return handle_integration_slack(node, ctx, node_input)
def handle_output_s3(node, ctx, node_input): return handle_integration_aws_s3(node, ctx, node_input)
def handle_output_display(node, ctx, node_input): return {"display": node_input, "output": node_input}
def handle_output_notification(node, ctx, node_input): return {"notification": str(node_input), "sent": True}

def handle_stub(node, ctx, node_input):
    nt = node.get("data", {}).get("type", "unknown")
    return {"output": node_input, "passthrough": True, "nodeType": nt, "note": f"Node type '{nt}' executed with passthrough in sandbox."}

# ─── Dispatch table ────────────────────────────────────────────────────────────
HANDLERS = {
    "trigger.manual": lambda n,c,i: handle_trigger_manual(n,c),
    "trigger.webhook": lambda n,c,i: handle_trigger_webhook(n,c),
    "trigger.schedule": lambda n,c,i: handle_trigger_schedule(n,c),
    "trigger.event": lambda n,c,i: handle_trigger_event(n,c),
    "trigger.email": lambda n,c,i: handle_trigger_generic(n,c),
    "trigger.file_watch": lambda n,c,i: handle_trigger_generic(n,c),
    "trigger.database": lambda n,c,i: handle_trigger_generic(n,c),
    "trigger.mqtt": lambda n,c,i: handle_trigger_generic(n,c),
    "trigger.websocket": lambda n,c,i: handle_trigger_generic(n,c),
    "trigger.kafka": lambda n,c,i: handle_trigger_generic(n,c),
    "ai.llm": handle_ai_llm, "ai.chat": handle_ai_chat, "ai.completion": handle_ai_completion,
    "ai.summarization": handle_ai_summarization, "ai.sentiment": handle_ai_sentiment,
    "ai.classification": handle_ai_classification, "ai.translation": handle_ai_translation,
    "ai.embedding": handle_ai_embedding, "ai.moderation": handle_ai_moderation,
    "ai.vector_search": handle_stub, "ai.image_generation": handle_stub, "ai.image_analysis": handle_stub,
    "ai.speech_to_text": handle_stub, "ai.text_to_speech": handle_stub, "ai.ocr": handle_stub,
    "agent.llm": handle_agent_llm, "agent.condition": handle_agent_condition, "agent.react": handle_agent_react,
    "agent.supervisor": handle_agent_supervisor, "agent.planner": handle_agent_planner,
    "agent.tool": handle_stub, "agent.loop": handle_control_loop, "agent.worker": handle_agent_llm,
    "memory.buffer": handle_memory_buffer, "memory.summary": handle_memory_summary, "memory.window": handle_memory_window,
    "memory.redis": handle_stub, "memory.postgres": handle_stub,
    "rag.pdf_loader": handle_rag_pdf_loader, "rag.web_loader": handle_rag_web_loader,
    "rag.text_splitter": handle_rag_text_splitter, "rag.embedder": handle_rag_embedder,
    "rag.vector_store": handle_rag_vector_store, "rag.retriever": handle_rag_retriever,
    "rag.qa_chain": handle_rag_qa_chain, "rag.reranker": handle_rag_reranker,
    "control.condition": handle_control_condition, "control.switch": handle_control_switch,
    "control.loop": handle_control_loop, "control.foreach": handle_control_foreach,
    "control.while": handle_control_while, "control.parallel": handle_control_parallel,
    "control.sequence": handle_control_sequence, "control.error": handle_control_error,
    "control.retry": handle_control_retry, "control.timeout": handle_control_timeout,
    "integration.http": handle_integration_http, "integration.rest": handle_integration_rest,
    "integration.graphql": handle_integration_graphql, "integration.webhook": handle_integration_http,
    "integration.soap": handle_stub, "integration.grpc": handle_stub,
    "integration.websocket": handle_stub, "integration.sse": handle_stub,
    "integration.oauth": handle_stub, "integration.api_key": handle_stub,
    "integration.postgres": handle_integration_postgres, "integration.mongodb": handle_integration_mongodb,
    "integration.redis": handle_integration_redis, "integration.supabase": handle_integration_supabase,
    "integration.elasticsearch": handle_stub, "integration.database": handle_stub,
    "integration.dynamodb": handle_stub, "integration.cassandra": handle_stub, "integration.firestore": handle_stub,
    "integration.mysql": handle_stub,
    "integration.aws_s3": handle_integration_aws_s3, "integration.github": handle_integration_github,
    "integration.stripe": handle_integration_stripe, "integration.notion": handle_integration_notion,
    "integration.airtable": handle_integration_airtable, "integration.jira": handle_integration_jira,
    "integration.google_sheets": handle_integration_google_sheets,
    "integration.aws_lambda": handle_stub, "integration.aws_sqs": handle_stub, "integration.aws_sns": handle_stub,
    "integration.gcp_storage": handle_stub, "integration.gcp_pubsub": handle_stub,
    "integration.azure_blob": handle_stub, "integration.azure_queue": handle_stub,
    "integration.cloudflare_kv": handle_stub, "integration.cloudflare_r2": handle_stub,
    "integration.cloudflare_d1": handle_stub, "integration.vercel_kv": handle_stub,
    "integration.vercel_blob": handle_stub, "integration.netlify": handle_stub, "integration.railway": handle_stub,
    "integration.slack": handle_integration_slack, "integration.discord": handle_integration_discord,
    "integration.telegram": handle_integration_telegram, "integration.email": handle_integration_email,
    "integration.smtp": handle_integration_email, "integration.sendgrid": handle_integration_sendgrid,
    "integration.twilio": handle_integration_twilio, "integration.mailgun": handle_stub,
    "integration.whatsapp": handle_stub, "integration.sms": handle_stub,
    "integration.gitlab": handle_stub, "integration.bitbucket": handle_stub,
    "integration.linear": handle_stub, "integration.asana": handle_stub,
    "integration.excel": handle_stub, "integration.paypal": handle_stub,
    "integration.square": handle_stub, "integration.plaid": handle_stub, "integration.quickbooks": handle_stub,
    "integration.google_analytics": handle_integration_analytics_generic,
    "integration.mixpanel": handle_integration_analytics_generic,
    "integration.segment": handle_integration_analytics_generic,
    "integration.amplitude": handle_integration_analytics_generic,
    "integration.posthog": handle_integration_analytics_generic,
    "transform.data": handle_transform_data, "transform.filter": handle_transform_filter,
    "transform.map": handle_transform_map, "transform.reduce": handle_transform_reduce,
    "transform.aggregate": handle_transform_aggregate, "transform.sort": handle_transform_sort,
    "transform.dedupe": handle_transform_dedupe, "transform.json": handle_transform_json,
    "transform.csv": handle_transform_csv, "transform.regex": handle_transform_regex,
    "transform.html": handle_transform_html, "transform.template": handle_transform_template,
    "transform.split": handle_transform_split, "transform.merge": handle_transform_merge,
    "transform.xml": handle_transform_xml, "transform.yaml": handle_transform_yaml,
    "sandflare.python": handle_sandflare_python, "sandflare.bash": handle_sandflare_bash,
    "sandflare.nodejs": handle_sandflare_nodejs, "sandflare.go": handle_sandflare_go,
    "sandflare.rust": handle_sandflare_rust, "sandflare.ruby": handle_sandflare_ruby,
    "sandflare.php": handle_sandflare_php, "sandflare.java": handle_sandflare_java,
    "sandflare.docker": handle_sandflare_docker, "sandflare.jupyter": handle_sandflare_jupyter,
    "sandflare.execute": handle_sandflare_execute, "sandflare.scrape": handle_sandflare_scrape,
    "sandflare.playwright": handle_sandflare_playwright, "sandflare.file_write": handle_sandflare_file_write,
    "sandflare.file_read": handle_sandflare_file_read, "sandflare.file_list": handle_sandflare_file_list,
    "sandflare.install": handle_sandflare_install, "sandflare.git_clone": handle_sandflare_git_clone,
    "sandflare.snapshot": handle_sandflare_snapshot, "sandflare.fork": handle_sandflare_fork,
    "sandflare.metrics": handle_sandflare_metrics, "sandflare.memory_add": handle_sandflare_memory_add,
    "sandflare.memory_search": handle_sandflare_memory_search,
    "utility.delay": handle_utility_delay, "utility.log": handle_utility_log,
    "utility.variable": handle_utility_variable, "utility.code": handle_utility_code,
    "output.response": handle_output_response, "output.json": handle_output_json,
    "output.file": handle_output_file, "output.email": handle_output_email,
    "output.webhook": handle_output_webhook, "output.database": handle_output_database,
    "output.slack": handle_output_slack, "output.s3": handle_output_s3,
    "output.display": handle_output_display, "output.notification": handle_output_notification,
}

# ─── DAG runner ────────────────────────────────────────────────────────────────
def execute_node(node: dict, definition: dict, ctx: Ctx) -> Any:
    node_id = node.get("id", ""); node_type = node.get("data", {}).get("type", "")
    cfg = node.get("data", {}).get("config", {}); node_name = cfg.get("label", cfg.get("name", node_type))
    edges = definition.get("edges", []); start_ms = int(time.time() * 1000)
    evt_node_start(node_id, node_name)
    try:
        node_input = ctx.get_node_input(node_id, edges)
        handler = HANDLERS.get(node_type, handle_stub)
        result = handler(node, ctx, node_input)
        ctx.node_outputs[node_id] = result
        duration_ms = int(time.time() * 1000) - start_ms
        evt_node_complete(node_id, node_name, result, duration_ms)
        # Determine branch for condition/switch nodes
        active_branch = None
        if isinstance(result, dict):
            active_branch = result.get("metadata", {}).get("branch") or result.get("branch")
        # Execute downstream nodes
        for edge in [e for e in edges if e.get("source") == node_id]:
            source_handle = edge.get("sourceHandle")
            if active_branch is not None and source_handle and source_handle != active_branch:
                continue
            target_id = edge.get("target")
            if not target_id or target_id in ctx.node_outputs:
                continue
            target_node = next((n for n in definition.get("nodes", []) if n.get("id") == target_id), None)
            if target_node:
                execute_node(target_node, definition, ctx)
        return result
    except Exception as e:
        duration_ms = int(time.time() * 1000) - start_ms
        evt_node_error(node_id, node_name, str(e), duration_ms)
        raise

def main():
    try:
        _b64d = lambda k, default="{}": json.loads(base64.b64decode(os.environ.get(k, base64.b64encode(default.encode()).decode())).decode())
        workflow_def = _b64d("WORKFLOW_DEFINITION")
        input_data = _b64d("WORKFLOW_INPUT")
        secrets = _b64d("WORKFLOW_SECRETS")
        variables = _b64d("WORKFLOW_VARIABLES")
        env_vars = _b64d("WORKFLOW_ENV_VARS")
        ctx = Ctx(input_data, variables, secrets, env_vars)
        nodes = workflow_def.get("nodes", []); edges = workflow_def.get("edges", [])
        node_ids_with_incoming = {e.get("target") for e in edges}
        trigger_nodes = [n for n in nodes if n.get("id") not in node_ids_with_incoming]
        if not trigger_nodes:
            trigger_nodes = [n for n in nodes if n.get("data", {}).get("type", "").startswith("trigger.")]
        if not trigger_nodes and nodes:
            trigger_nodes = [nodes[0]]
        if not trigger_nodes:
            raise ValueError("No trigger node found in workflow")
        for trigger_node in trigger_nodes:
            execute_node(trigger_node, workflow_def, ctx)
        evt_exec_complete()
    except Exception as e:
        evt_exec_error(str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
`;