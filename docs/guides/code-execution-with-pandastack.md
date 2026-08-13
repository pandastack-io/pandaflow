# Running code nodes in PandaStack microVMs

PandaFlow executes workflows inside [PandaStack](https://pandastack.ai) Firecracker microVMs — hardware-isolated sandboxes with sub-second boot. This guide explains how the execution path works, how to get an API key, what the `pandastack.*` node family does, and how to develop fully offline with the mock provider.

Everything below is grounded in the code — file paths are relative to the repo root:

| Concern | File |
|---|---|
| microVM runner | [`lib/execution/pandastack-workflow-runner.ts`](../../lib/execution/pandastack-workflow-runner.ts) |
| Executor selection | [`lib/execution/start-workflow-execution.ts`](../../lib/execution/start-workflow-execution.ts) |
| Python runtime injected into the VM | [`lib/execution/workflow-python-runtime.ts`](../../lib/execution/workflow-python-runtime.ts) |
| Node palette / registry | [`lib/nodes/registry.ts`](../../lib/nodes/registry.ts), [`types/nodes.ts`](../../types/nodes.ts) |
| Mock / provider fallback | [`lib/pandastack/manager.ts`](../../lib/pandastack/manager.ts) |
| Startup validation | [`instrumentation.ts`](../../instrumentation.ts) |

## How execution works

### Which executor runs your workflow

`startWorkflowExecution()` in [`lib/execution/start-workflow-execution.ts`](../../lib/execution/start-workflow-execution.ts) picks one of two paths:

1. **PandaStack microVM path** (`runWorkflowInSandbox`) — the default fast path.
2. **Durable TypeScript executor** (`WorkflowExecutor`) — used when any of these is true:
   - `isPandaStackEnabled()` returns `false` (no real API key configured — see [offline mode](#offline-development-mock-api-key)),
   - the run was started in **debug mode**,
   - the workflow contains a node type that needs long-lived server-side state: `control.sub_workflow`, `agent.invoke`, `agent.supervisor`, or `agent.bus.subscribe`.

`isPandaStackEnabled()` (defined at the bottom of [`pandastack-workflow-runner.ts`](../../lib/execution/pandastack-workflow-runner.ts)) is simply:

```ts
const key = process.env.PANDASTACK_API_KEY;
return Boolean(key && !key.startsWith('mock-') && key !== 'mock-api-key');
```

### The whole workflow runs in ONE microVM

PandaFlow does **not** create a sandbox per node. `runWorkflowInSandbox()` provisions a single microVM and runs the entire workflow DAG inside it:

1. **Pick a template** (see below).
2. **Create the sandbox** via `@pandastack/sdk`:
   ```ts
   Sandbox.create(
     { template, ttlSeconds: 3600, metadata: { pandaflow_execution: executionId.slice(0, 8) } },
     { apiKey, apiUrl }  // PANDASTACK_API_KEY / PANDASTACK_API (default https://api.pandastack.ai)
   );
   ```
3. **Write two files** into the guest:
   - `/tmp/workflow_runtime.py` — the ~1000-line Python runtime from [`workflow-python-runtime.ts`](../../lib/execution/workflow-python-runtime.ts) that interprets every node type,
   - `/tmp/workflow_env.sh` — an env script exporting the workflow payload as base64-encoded JSON (`WORKFLOW_DEFINITION`, `WORKFLOW_INPUT`, `WORKFLOW_SECRETS`, `WORKFLOW_VARIABLES`, `WORKFLOW_ENV_VARS`, plus `PYTHONUNBUFFERED=1`). Base64 means the values contain no shell metacharacters, so single-quoting is safe. The script is *sourced* at exec time because PandaStack does not inject env vars at sandbox-create time.
4. **Stream execution**:
   ```ts
   await sandbox.execStream("sh -lc '. /tmp/workflow_env.sh && python3 -u /tmp/workflow_runtime.py'", { onStdout });
   ```
5. The runtime walks the DAG (entry nodes = nodes with no incoming edges) and emits **one JSON object per stdout line**:

   | Event | Payload |
   |---|---|
   | `node:start` | `nodeId`, `nodeName`, `timestamp` |
   | `node:complete` | `nodeId`, `nodeName`, `output`, `durationMs` |
   | `node:error` | `nodeId`, `nodeName`, `error`, `durationMs` |
   | `execution:complete` | `timestamp` |
   | `execution:error` | `error` |

   Each parsed line is fed to `executionEmitter` for real-time SSE delivery to the dashboard and buffered into the `execution_logs` table.
6. **The sandbox is killed in a `finally` block** — nothing outlives the run.

Branching works via edge `sourceHandle`s: when a node result carries a `branch` (e.g. `control.condition`, `control.switch`), only edges whose `sourceHandle` matches the active branch fire. Every edge fires at most once per run (cycle guard).

### Template selection: `browser` vs `code-interpreter`

`pickTemplate()` in the runner scans the workflow's node types:

- **`browser`** — chosen when the workflow contains `pandastack.playwright` or `pandastack.scrape` (Chromium + Playwright pre-installed).
- **`code-interpreter`** — everything else (Python with `openai`, `anthropic`, `langchain`, `pandas`, `numpy`, `requests`, etc. pre-installed).

One workflow → one template. A single Playwright node anywhere in the graph moves the whole run onto the `browser` template.

## Getting a `PANDASTACK_API_KEY`

1. Sign up / log in at [pandastack.ai](https://pandastack.ai).
2. In the dashboard, open **API Tokens** and create a token. Tokens have the `pds_` prefix.
3. Add it to `.env.local` (see [`.env.example`](../../.env.example)):

```bash
# PandaStack execution backend — the app refuses to start without this.
PANDASTACK_API_KEY=pds_...
# Optional: override the API endpoint (defaults to https://api.pandastack.ai)
PANDASTACK_API=https://api.pandastack.ai
```

PandaFlow **refuses to start** without `PANDASTACK_API_KEY` — [`instrumentation.ts`](../../instrumentation.ts) throws on boot with instructions. For development without a real key, see [offline mode](#offline-development-mock-api-key).

## The `pandastack.*` node family

The palette entries live in [`lib/nodes/registry.ts`](../../lib/nodes/registry.ts) (search for `['pandastack.`); the in-VM handlers live in [`workflow-python-runtime.ts`](../../lib/execution/workflow-python-runtime.ts) (search for `handle_pandastack_`). All of them operate on the **same shared sandbox** — a file written by one node is readable by the next.

| Node type | What the handler actually does |
|---|---|
| `pandastack.python` | `exec()`s your code in-process in the runtime's Python interpreter (see [contract below](#the-input--output-contract-inside-python-nodes)) |
| `pandastack.nodejs` | `node -e <code>` subprocess; the node input is available as the `INPUT` env var (JSON string); 60s timeout |
| `pandastack.bash` | `subprocess.run(cmd, shell=True)`; returns `{stdout, stderr, exitCode}`; 60s timeout |
| `pandastack.execute` | Generic node with **language dispatch**: `language: python\|python3\|jupyter` → Python handler, `nodejs\|node\|javascript` → Node handler, anything else → Bash handler |
| `pandastack.scrape` | `urllib` fetch + BeautifulSoup parse → `{html, text, title, links, headings, url}` (plain-regex fallback if bs4 missing). Forces the `browser` template |
| `pandastack.playwright` | Headless Chromium via `playwright.sync_api`; supports `url` + `actions` list (`click` / `fill` / `extract` with CSS selectors); returns page title, extracted text, first 5000 chars of HTML. Forces the `browser` template |
| `pandastack.file_write` | Write a file at `path` with `content` → `{written, path, size}` |
| `pandastack.file_read` | Read the file at `path` → `{content, path, size}` |
| `pandastack.file_list` | `glob` a `directory` + `pattern` → `{files, count}` |
| `pandastack.install` | `python -m pip install --quiet <packages>` (list or comma-separated string); 120s timeout |
| `pandastack.git_clone` | `git clone --depth 1 --branch <branch> <url> <directory>` (defaults: branch `main`, dir `/tmp/repo`); 120s timeout |
| `pandastack.go` / `rust` / `ruby` / `php` / `java` / `docker` | Write-and-run via the language toolchain (`go run`, `rustc`, `ruby -e`, `php -r`, `javac`+`java`, `docker run`). These only work if the toolchain exists in the template — the `code-interpreter` template is Python/Node-focused, so expect failures for the exotic ones |
| `pandastack.jupyter` | Alias for the Python handler |
| `pandastack.snapshot` / `fork` / `metrics` / `memory_add` / `memory_search` | **In-runtime stubs today**: snapshot/fork return synthetic IDs, metrics returns fixed numbers, memory_add/search use an in-process dict that does not persist beyond the run. Do not build on these for production yet |

Any node type the runtime doesn't recognize runs as a **passthrough** (`handle_stub`): input is forwarded unchanged with a `note` field telling you so.

## The input / output contract inside Python nodes

`handle_pandastack_python` builds a single namespace (globals == locals, so names defined at the top level are visible inside comprehensions — a classic `exec` gotcha) and runs your code with:

**Pre-bound names:**

- `input_json` — the payload from the connected upstream node (this node's input). If the upstream output was a *string*, the runtime attempts `json.loads` on it; on failure you get the raw string.
- `input` — bound to the node input first, but then **workflow variables are merged into the namespace last**, and the variables map always contains an `input` key holding the workflow's trigger input. Net effect: `input` resolves to the *workflow-level* trigger input, while `input_json` is the *upstream node's* output. For the first node in a chain they're the same object.
- All workflow **variables** by name (e.g. a variable `threshold` is directly usable as `threshold`).
- Pre-imported modules: `json`, `os`, `time`, `re`, `sys`, `subprocess` — plus full `__builtins__`, so you can `import` anything installed in the template.

**Returning output** — assign to any of these names; the first one that is non-`None` wins, checked in this order:

```
output  →  output_json  →  result  →  results  →  return_value
```

The node's result is then `{"output": <value>, "exitCode": 0}`. Downstream nodes receive that dict as their input, and template expressions can reference it as `{{<nodeId>.output}}`.

**Example node code:**

```python
# input_json is the upstream node's output
rows = input_json.get("rows", []) if isinstance(input_json, dict) else []

total = sum(r.get("amount", 0) for r in rows)

output = {"total": total, "count": len(rows)}
```

Two caveats:

- The value you return is serialized with `json.dumps(..., default=str)` — non-JSON types are stringified.
- Don't `print()` raw JSON objects to stdout from inside a Python node: the host parses **every stdout line starting with `{`** as an execution event. Debug with `print(..., file=sys.stderr)` instead (that's what the `utility.log` node does).

## Environment variables & secrets injection

Three layers, all delivered through the sourced `/tmp/workflow_env.sh` script as base64-encoded JSON:

1. **Organization secrets** (`WORKFLOW_SECRETS`) — rows from the `credentials` Postgres table, AES-256-GCM encrypted at rest with `ENCRYPTION_KEY` and decrypted by `loadSecrets()` in the runner just before launch. Secrets that fail to decrypt are silently skipped.
2. **Workflow env vars** (`WORKFLOW_ENV_VARS`) — per-workflow environment overrides.
3. **Workflow variables** (`WORKFLOW_VARIABLES`) — non-secret values, merged into the Python-node namespace.

Built-in integration nodes resolve credentials with `ctx.secret(name)`, which checks **secrets → workflow env vars → the VM's `os.environ`**, in that order. They look for well-known names — for example `OPENAI_API_KEY` (LLM nodes), `ANTHROPIC_API_KEY`, `SLACK_WEBHOOK_URL` / `SLACK_BOT_TOKEN`, `POSTGRES_URL`, `MONGODB_URI`, `SENDGRID_API_KEY`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, `GITHUB_TOKEN`, `STRIPE_SECRET_KEY`. Add these under **Secrets** in the dashboard and the nodes pick them up.

Inside a **custom Python node**, secrets are *not* auto-exported as individual environment variables — the whole map sits in `WORKFLOW_SECRETS` as base64 JSON. Decode it yourself:

```python
import os, json, base64

secrets = json.loads(base64.b64decode(os.environ["WORKFLOW_SECRETS"]))
api_key = secrets.get("MY_SERVICE_API_KEY")
```

The microVM is destroyed at the end of the run, so decrypted secrets never persist.

## Offline development: `mock-api-key`

To develop without a PandaStack account (no microVMs, no network):

```bash
PANDASTACK_API_KEY=mock-api-key
```

Any key equal to `mock-api-key` or starting with `mock-` counts as a mock key. What changes:

- `isPandaStackEnabled()` returns `false`, so every run takes the **durable TypeScript executor** path instead of a microVM.
- On that path, `pandastack.*` nodes go through `SandboxManager` ([`lib/pandastack/manager.ts`](../../lib/pandastack/manager.ts)), which registers a `MockSandboxProvider` unconditionally and only adds the real `PandaStackClient` for non-mock keys. With provider `auto` (the default) the mock provider is selected; results are simulated, not executed.
- Even with a real key, `SandboxManager` falls back to the mock provider when the real provider errors (`fallbackToMock` defaults to `true`; set `fallbackToMock: false` in the node config to fail hard instead).

The startup check in [`instrumentation.ts`](../../instrumentation.ts) accepts `mock-api-key` — it only rejects a *missing* key, so you must opt into mock mode explicitly.

## Troubleshooting

**The app throws `PANDASTACK_API_KEY is not set` on startup.**
Expected — PandaFlow won't boot without the variable. Set a real `pds_...` token or `mock-api-key` in `.env.local` and restart.

**My workflow never touches a microVM.**
Check the three durable-path triggers: debug mode, a mock key, or a durable node type (`control.sub_workflow`, `agent.invoke`, `agent.supervisor`, `agent.bus.subscribe`) anywhere in the graph. Any of these routes the whole run to the TypeScript executor.

**A node "succeeds" but just echoes its input with a `passthrough: true` note.**
That node type has no in-VM handler yet — the runtime ran `handle_stub`. Check the `HANDLERS` dispatch table in [`workflow-python-runtime.ts`](../../lib/execution/workflow-python-runtime.ts) for what's implemented.

**`pandastack.go` / `rust` / `java` / `docker` fail with "command not found".**
The `code-interpreter` template ships Python and Node tooling; other toolchains may not be present. Python, Node.js, and Bash are the reliable languages.

**Playwright node fails with a missing-browser error.**
Playwright/scrape nodes require the `browser` template. Template selection is automatic per workflow — if it still fails, confirm the node's `type` is exactly `pandastack.playwright` or `pandastack.scrape` (only those two force the `browser` template).

**A Python node's `print()` corrupted the execution events.**
Stdout lines starting with `{` are parsed as runtime events; other lines are ignored. Print debug output to stderr.

**`ModuleNotFoundError` in a Python node.**
Add a `pandastack.install` node before it (pip, 120s timeout), or shell out: `subprocess.run([sys.executable, "-m", "pip", "install", "requests"])`.

**Long commands die at 60 seconds.**
Bash and Node.js subprocess handlers hard-cap at 60s (`install` and `git_clone` at 120s). Split the work or move it into a Python node, which has no subprocess timeout of its own — but note the sandbox itself has a 3600s TTL.

**Where are my logs?**
Live events stream over SSE during the run; after completion they're persisted to the `execution_logs` table (`nodeId`, level, message, output payloads, durations).

## See also

- [README](../../README.md) — setup, environment variables, deployment
- [QUICKSTART](../../QUICKSTART.md) — first workflow walkthrough
- [PandaStack docs](https://docs.pandastack.ai) — sandbox lifecycle, templates, SDK reference
