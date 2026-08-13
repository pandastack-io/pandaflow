# HTTP API reference

PandaFlow's HTTP API is the same API the dashboard uses — every route lives under `/api` on the Next.js server (default `http://localhost:3000` after [Quickstart](../../QUICKSTART.md)). Workflow nodes execute inside [PandaStack](https://pandastack.ai) microVMs; the endpoints below control workflows, executions, and agents on the control plane — they do not talk to sandboxes directly.

Conventions:

- All request/response bodies are JSON unless noted (SSE endpoints stream `text/event-stream`).
- Most responses use the envelope `{ "success": true, "data": ... }` on success and `{ "success": false, "error": "..." }` with a 4xx/5xx status on failure. Exceptions are called out per endpoint (e.g. Traces returns a bare object).
- `{id}` path segments are UUIDs unless stated otherwise.

## Auth

### Session cookie (default)

Auth is NextAuth (JWT session strategy). Sign in via the UI at `/sign-in` (email+password, and Google/GitHub/magic-link when the corresponding env vars are set — see [README](../../README.md) for env setup). The browser session cookie is what authenticates API calls.

Two layers enforce it:

1. **Middleware** (`middleware.ts`) returns `401 {"success":false,"error":"Unauthorized"}` for any request without a session to paths matching `/api/workflows/*`, `/api/agents/*`, `/api/executions/*`.
2. **Route-level org resolution** — routes for secrets, webhooks, schedules, API keys, and agent-bus reads call `requireOrgId()`, which resolves your organization from the session and returns `401` without one.

### `SKIP_AUTH=true` (local dev / trusted single-tenant)

Setting `SKIP_AUTH=true` bypasses the middleware entirely and makes `requireOrgId()` fall back to the default seed organization. Every endpoint then works with plain `curl` and no cookie:

```bash
curl -s http://localhost:3000/api/workflows | jq .
```

### Machine surfaces

These endpoints carry their own credentials and are intended for automation:

| Surface | Credential | Endpoint |
|---|---|---|
| Agent invoke | `Authorization: Bearer <identity_token>` (returned when the agent is created) | `POST /api/agents/invoke` |
| Agent bus publish | `X-Agent-Token: <identity_token>` | `POST /api/agent-bus/publish` |
| Scheduler tick | `x-scheduler-secret: $SCHEDULER_SECRET` (returns `500` if the env var is unset) | `GET /api/agents/scheduler/tick` |
| Webhook trigger | Per-webhook: `authType: "none"` (default) or `"bearer"` with the token stored in the webhook's `authConfig.token` | `ANY /api/webhooks/trigger/{urlPath}` |
| Agent heartbeat | none of its own | `POST /api/agents/{id}/heartbeat` |

> **Caveat for cookie-auth deployments:** the session middleware matcher covers `/api/agents/*` and `/api/executions/*`, which includes `invoke`, `heartbeat`, `scheduler/tick`, and `executions/{id}/retry`. When `SKIP_AUTH` is not `true`, the middleware 401s those requests *before* their own credential check runs. If you rely on these machine surfaces in a cookie-auth deployment, either run with `SKIP_AUTH=true` behind your own perimeter or remove those prefixes from the `matcher` in `middleware.ts`. Webhook triggers (`/api/webhooks/trigger/*`), agent-bus, and chat are **not** in the matcher and work in any mode.

### API keys (provisioning only — not yet enforced)

`/api/api-keys` mints `sk-...` keys (only a SHA-256 hash is stored; the full key is returned once at creation). No route currently validates these keys as request credentials — treat this surface as provisioning for a future feature, not as working auth today.

## Workflows

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/workflows` | — | Array of workflow rows |
| `POST` | `/api/workflows` | `{name, definition, description?, workflowType?, chatSettings?, tags?}` — `name` and `definition` required | Created workflow (incl. `id`) |
| `GET` | `/api/workflows/{id}` | — | Workflow row; `404` if missing |
| `PUT` | `/api/workflows/{id}` | Any of `name, description, definition, status, workflowType, chatSettings, isPublic, chatPublicId, tags` | Updated workflow |
| `PATCH` | `/api/workflows/{id}` | Settings subset: `workflowType, chatSettings, isPublic, chatPublicId, tags` (switching to `workflowType: "chat"` auto-generates a `chatPublicId`) | Updated workflow |
| `DELETE` | `/api/workflows/{id}` | — | Deleted workflow row |
| `POST` | `/api/workflows/{id}/execute` | `{input?, variables?, envVars?, debug?}` | `{executionId, status: "running"}` |
| `GET` | `/api/workflows/{id}/executions` | Query: `page`, `pageSize` (max 50), `status` (`completed`\|`failed`\|`running`), `sortBy` (`status`\|`triggerType`\|`startedAt`\|`durationMs`\|`nodeCount`), `sortOrder` (`asc`\|`desc`) | `{workflow, executions[], pagination, stats}` |
| `POST` | `/api/workflows/generate` | `{description}` (or `prompt`); optional `workflowId` to generate without persisting a new workflow | Generated `{name, description, definition, workflowId}` — creates and saves the workflow unless `workflowId` was passed |

Run a workflow:

```bash
curl -s -X POST http://localhost:3000/api/workflows/$WORKFLOW_ID/execute \
  -H 'Content-Type: application/json' \
  -d '{"input": {"query": "hello"}}'
# => {"success":true,"data":{"executionId":"...","status":"running"}}
```

## Executions

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/executions` | Query: `workflowId?`, `agentId?`, `limit?` (default 50) | Executions with `workflowName` and `costUsd` |
| `POST` | `/api/executions` | `{workflowId, triggerType?, input?, variables?, envVars?, debug?, metadata?, agentId?}` — `triggerType` one of `manual`\|`schedule`\|`webhook`\|`event`\|`chat` (default `manual`) | `{executionId, status: "running"}` |
| `GET` | `/api/executions/{id}` | — | `{execution, steps[], logs[], nodeExecutions[], costUsd}` — per-node replay with input/output/logs/prompt |
| `GET` | `/api/executions/{id}/stream` | — | SSE stream; first event `{type:"connected"}`, then live execution events |
| `POST` | `/api/executions/{id}/retry` | — (no body) | `{success, originalExecutionId, newExecution}` — only for `failed`/`cancelled` executions (`400` otherwise); re-runs with the original input and resolves open dead-letter-queue entries |
| `POST` | `/api/executions/{id}/debug` | `{action: "continue" \| "abort"}` | Ack; `404` if the execution isn't paused at a breakpoint |
| `GET` | `/api/executions/{id}/pending` | — | Pending human-in-the-loop approval `{nodeId, title, message}` or `data: null` |
| `POST` | `/api/executions/{id}/approve` | `{nodeId, decision: "approved" \| "rejected", comment?}` | `{success: true}`; `404` if no pending approval for that node |

**Public integration surface:** `POST /api/executions/{id}/retry` is designed to be called from external monitors/alerting to re-run failed executions (see the middleware caveat under [Auth](#machine-surfaces)).

```bash
# Retry a failed execution
curl -s -X POST http://localhost:3000/api/executions/$EXECUTION_ID/retry

# Follow an execution live (SSE)
curl -N http://localhost:3000/api/executions/$EXECUTION_ID/stream
```

## Agents

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/agents` | Query: `workflowId?` | Agents with `workflowName`, heartbeat/cost counters |
| `POST` | `/api/agents` | `{workflowId, name, description?, config?}` | Created agent — **includes `identityToken`**, the bearer credential for `invoke` and agent-bus |
| `GET` | `/api/agents/{id}` | — | Agent detail + `recentEvents`, `messages`, `health`, `isAutoHealing` |
| `PATCH` | `/api/agents/{id}` | `{config?, schedule?: {enabled?, cron?, timezone?}}` | Updated config + `nextRuns` (next 5 cron fire times) |
| `DELETE` | `/api/agents/{id}` | — | `{id}` |
| `POST` | `/api/agents/{id}/lifecycle` | `{action: "start" \| "stop" \| "pause" \| "resume" \| "restart"}` | `{agentId, action, status, executionId?}` — `start`/`restart` also trigger a workflow execution |
| `POST` | `/api/agents/{id}/heartbeat` | `{uptime?, memoryUsed?}` (numbers; empty body OK) | `{success: true}`; a `crashed` agent flips back to `running` |
| `GET` | `/api/agents/{id}/memory` | Query: `key?` | All memories in the agent's namespace, or one entry when `key` given |
| `POST` | `/api/agents/{id}/memory` | `{key, value, metadata?}` | `{namespace, key}` |
| `DELETE` | `/api/agents/{id}/memory` | Query: `key?` — omit to delete **all** memories | `{namespace, deleted}` |
| `GET` | `/api/agents/{id}/cost` | — | `{totalCostUsd, executionCount, breakdown (llm/sandbox/tokens), byDay[7], topExpensiveNodes[5]}` |
| `POST` | `/api/agents/invoke` | Header `Authorization: Bearer <identity_token>`; body `{input?, variables?, envVars?}`; query `?stream=true` for SSE | `{executionId, agentId, agentName, status}` — or an SSE stream of execution events ending at `execution:complete`/`execution:error`. `409` if the agent is paused |
| `GET` | `/api/agents/scheduler/tick` | Header `x-scheduler-secret: $SCHEDULER_SECRET` | `{ran, agents[]}` — runs every agent whose cron schedule is due |

**Public integration surface:** `POST /api/agents/{id}/heartbeat` is meant to be called by your own agent processes/supervisors to report liveness, and `POST /api/agents/invoke` is the token-authenticated entry point for external services (both sit under the middleware matcher — see the [Auth caveat](#machine-surfaces)).

```bash
# Invoke an agent from an external service
curl -s -X POST http://localhost:3000/api/agents/invoke \
  -H "Authorization: Bearer $AGENT_IDENTITY_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"input": {"task": "summarize inbox"}}'

# Drive agent cron schedules (run this from real cron / a scheduler every minute)
curl -s http://localhost:3000/api/agents/scheduler/tick \
  -H "x-scheduler-secret: $SCHEDULER_SECRET"
```

## Agent bus

Pub/sub between agents. Publishing requires an agent identity token; reads are session-scoped.

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `POST` | `/api/agent-bus/publish` | Header `X-Agent-Token: <identity_token>`; body `{topic, payload}` (`payload` must be a JSON object) | `{messageId}` |
| `GET` | `/api/agent-bus/topics` | — | Topic list |
| `GET` | `/api/agent-bus/{topic}/messages` | Query: `limit?` (1–100, default 20) | Recent messages on the topic |

## Templates

There is **no templates HTTP API**. The template gallery at `/templates` ships its catalog client-side; "Use template" simply `POST`s the template's definition to `POST /api/workflows`. To instantiate a template programmatically, create a workflow with the definition you want.

## Secrets / credentials

Values are encrypted at rest (`lib/secrets/crypto`); the list endpoint returns metadata only, but `GET`/`PATCH` on a single secret return the **decrypted value**.

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/secrets` | — | `[{id, name, type, description, createdAt}]` (no values) |
| `POST` | `/api/secrets` | `{name, value, type?, description?}` | Created metadata; `409` on duplicate name (case-insensitive, per org) |
| `GET` | `/api/secrets/{id}` | — | Secret **including decrypted `value`** |
| `PATCH` / `PUT` | `/api/secrets/{id}` | Any of `name, value, type, description` | Updated secret incl. decrypted `value` |
| `DELETE` | `/api/secrets/{id}` | — | `{id}` |

## API keys

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/api-keys` | — | Active keys (prefix, scopes, expiry — never the full key) |
| `POST` | `/api/api-keys` | `{name, scopes?, expiresAt?}` | Created key — `fullKey` (`sk-...`) is returned **only in this response** |
| `DELETE` | `/api/api-keys?id={id}` | — | Soft-revoke (sets `isActive: false`) |

See the [Auth note](#api-keys-provisioning-only--not-yet-enforced): these keys are not yet accepted as request credentials anywhere.

## Webhooks

A webhook binds one workflow to a stable trigger path. Creation is idempotent — one webhook per workflow; a repeat `POST` returns the existing one.

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/webhooks` | Query: `workflowId?` | Webhooks + `recentLogs` (last 5 deliveries each) |
| `POST` | `/api/webhooks` | `{workflowId, httpMethod?, authType?, authConfig?, requestSchema?, isActive?}` | Created webhook — note the generated `urlPath` (`wh_<16 chars>`) |
| `GET` | `/api/webhooks/{id}` | — | Webhook + `recentLogs` |
| `PATCH` | `/api/webhooks/{id}` | Any of `isActive, httpMethod, authType, authConfig` | Updated webhook |
| `DELETE` | `/api/webhooks/{id}` | — | `{id}` |
| `ANY` | `/api/webhooks/trigger/{urlPath}` | Request body/headers/query are passed to the workflow as `input` | `202 {executionId, status: "accepted"}`; `405` if the method doesn't match the webhook's `httpMethod` (default `POST`); `401` on bad bearer token; `410` if inactive; every delivery is logged |

**Public integration surface:** `/api/webhooks/trigger/{urlPath}` is outside the session middleware and is the intended unauthenticated (or bearer-protected) entry point for external systems.

```bash
# Trigger a workflow from an external system
curl -s -X POST http://localhost:3000/api/webhooks/trigger/wh_AbCdEfGh12345678 \
  -H 'Content-Type: application/json' \
  -d '{"event": "order.created", "orderId": 42}'
# => 202 {"success":true,"data":{"executionId":"...","status":"accepted"}}
```

## Schedules (workflow cron)

Cron schedules for workflows (distinct from per-agent schedules, which live in the agent's `config.schedule` via `PATCH /api/agents/{id}`).

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/schedules` | Query: `workflowId?` | Schedules with `cronExpression`, `timezone`, `nextRunAt`, `workflowName` |
| `POST` | `/api/schedules` | `{workflowId, cronExpression, timezone?, isActive?}` | Created schedule (idempotent per workflow — returns the existing one if present) |
| `PATCH` | `/api/schedules/{id}` | Any of `cronExpression, timezone, isActive` | Updated schedule (`nextRunAt` recomputed) |
| `DELETE` | `/api/schedules/{id}` | — | `{id}` |

## Chat

Chat-type workflows (`workflowType: "chat"`) are addressable by workflow UUID **or** their short `chatPublicId`. Public chats (`isPublic: true`) work without any session; private chats require one (`403` otherwise).

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/chat/{idOrPublicId}` | Query: `sessionId` (required, client-chosen) | `{messages[], title, createdAt}` for that chat session |
| `POST` | `/api/chat/{idOrPublicId}` | `{message, sessionId, history?}` | SSE stream: `{type:"token", content}` per token, then `{type:"done", sessionId, messageId, totalTokens}` (or `{type:"error"}`). Uses Anthropic when the workflow's provider is `anthropic` and `ANTHROPIC_API_KEY` is set, else OpenAI via `OPENAI_API_KEY` |

## Traces

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/traces/{traceId}` | — | **Bare object (no `success` envelope)**: `{traceId, rootExecution, totalCostUsd, totalDurationMs, nodeCount}` — `rootExecution` is a recursive tree of every execution in the trace (sub-workflows and `agent.invoke` children), each node carrying `executionId`, `agentId`, `workflowName`, `callDepth`, `status`, timing, `costUsd`, `children[]` |

## Dashboard stats

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `GET` | `/api/dashboard` | — | `{totalWorkflows, totalExecutions, executionsToday, successRate, avgDurationMs, failedToday, runningNow, executionsByDay[7], statusBreakdown, recentExecutions, recentWorkflows, topWorkflows}` |
| `GET` | `/api/dashboard/stats` | — | Alias — re-exports the same handler |

## Auth endpoints

| Method | Path | Body / params | Response essentials |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{name, email, password}` (password ≥ 8 chars) | `201 {user}` — also creates the user's default organization; `409` if the email exists |
| `GET`/`POST` | `/api/auth/[...nextauth]` | NextAuth protocol routes (sign-in, callbacks, session) | Managed by NextAuth — use the `/sign-in` UI or a NextAuth client rather than calling these directly |

---

See also: [README](../../README.md) for environment variables and provider setup, [QUICKSTART](../../QUICKSTART.md) for getting a local instance running.
