# Build and run your first workflow

This guide takes you from an empty PandaFlow install to a running two-node workflow, executed in an isolated [PandaStack](https://pandastack.ai) microVM, watched live over SSE, and retried if it fails.

**Prerequisites:** PandaFlow running locally at `http://localhost:3000` (see the [README](../../README.md) for setup and [QUICKSTART.md](../../QUICKSTART.md) for infrastructure options). All `curl` examples assume `SKIP_AUTH=true` in `.env.local` — without it, `/api/workflows/*` and `/api/executions/*` require a signed-in NextAuth session and return `401`.

## Concepts in 60 seconds

- **Workflow** — a directed graph of **nodes** (the boxes: triggers, code, HTTP calls, LLMs, …) connected by **edges** (the arrows that define data flow and run order). Stored as a JSON `definition` with `nodes` and `edges` arrays.
- **Node** — one unit of work. Each node has a `type` from the node registry ([`lib/nodes/registry.ts`](../../lib/nodes/registry.ts)), a `category`, and a `config`. Code nodes (`pandastack.execute`, `pandastack.python`, `pandastack.nodejs`, `pandastack.go`, `pandastack.bash`, …) run inside PandaStack microVMs — never on the PandaFlow host.
- **Execution** — one run of a workflow. It has a status (`running`, `completed`, `failed`, `cancelled`), per-node logs, inputs/outputs, and a duration. Executions are replayable after the fact.
- **Trigger** — what starts an execution:
  - **Manual** (`trigger.manual`) — the **Run** button in the editor, or `POST /api/workflows/{id}/execute`.
  - **Webhook** (`trigger.webhook`) — an HTTP request to `/api/webhooks/trigger/{path}` starts the workflow (webhooks are managed at `/webhooks` and via `/api/webhooks`).
  - **Schedule** (`trigger.schedule`) — a cron expression; created via `POST /api/schedules` with `{ "workflowId": "...", "cronExpression": "*/5 * * * *" }`.
  - **Chat** — workflows created with `workflowType: "chat"` get a chat UI at `/chat/{id}`; each message triggers an execution.

## Create a workflow in the UI

1. Open `http://localhost:3000/workflows` and click **New Workflow** (or go straight to `/workflows/new`).
2. Click the **+** button on the canvas to open the **node palette**. It lists every registered node grouped by category, with search.
3. Add a **Manual Trigger** (`trigger.manual`) — every runnable workflow starts with a trigger node.
4. Add a code node — e.g. **Execute Code** (`pandastack.execute`) — and connect the trigger's output handle to its input handle by dragging between them.
5. Click the code node to open its config panel. Pick a language (e.g. `python`) and enter some code. Whatever you `print` and assign to `output_json` becomes the node's output.
6. Click **Save**. The editor `POST`s to `/api/workflows` and you get a persistent workflow with an ID in the URL.
7. Click **Run** (or press <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>). If validation finds issues, you can review them and choose **Run anyway**.

## Or create it via the API

`POST /api/workflows` accepts:

| Field | Type | Notes |
|---|---|---|
| `name` | string | required, non-empty |
| `description` | string | optional |
| `definition` | object | required — `{ nodes: [], edges: [] }` (extra keys like `variables` pass through) |
| `workflowType` | string | optional — `automation` (default), `chat`, or `agent` |
| `tags` | string[] | optional |

Here is a real, minimal two-node workflow — a manual trigger wired into a Python code node:

```bash
curl -s -X POST http://localhost:3000/api/workflows \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Hello MicroVM",
    "description": "My first workflow",
    "definition": {
      "nodes": [
        {
          "id": "trigger-1",
          "type": "custom",
          "position": { "x": 100, "y": 100 },
          "data": {
            "type": "trigger.manual",
            "category": "trigger",
            "config": { "label": "Start" },
            "status": "idle"
          }
        },
        {
          "id": "code-1",
          "type": "custom",
          "position": { "x": 400, "y": 100 },
          "data": {
            "type": "pandastack.execute",
            "category": "pandastack",
            "config": {
              "label": "Say hello",
              "language": "python",
              "code": "import platform\nresult = {\"hello\": \"from a microVM\", \"python\": platform.python_version()}\nprint(result)\noutput_json = result",
              "timeout": 30000
            },
            "status": "idle"
          }
        }
      ],
      "edges": [
        {
          "id": "edge-1",
          "source": "trigger-1",
          "target": "code-1",
          "sourceHandle": null,
          "targetHandle": null,
          "type": "default"
        }
      ]
    }
  }'
```

The response is `{ "success": true, "data": { "id": "...", ... } }` — keep the `id`:

```bash
WORKFLOW_ID=$(curl -s -X POST http://localhost:3000/api/workflows \
  -H 'Content-Type: application/json' -d @workflow.json | jq -r '.data.id')
```

Node anatomy, for reference: `id` (unique within the workflow), `type: "custom"` (the React Flow renderer), `position` (canvas coordinates), and `data` holding the actual node `type`, its `category`, and its `config`. Edges connect `source` node ID to `target` node ID. Larger reference definitions live in [`tests/test-workflows/`](../../tests/test-workflows/) — note those files keep `nodes`/`edges` at the top level for the test harness, so wrap them in a `definition` key before POSTing.

## Import a template

Two options:

- **Built-in templates** — open `/templates`, browse the catalog, and click **Use Template**. PandaFlow copies the template's definition into a new workflow (via the same `POST /api/workflows`) and drops you in the editor.
- **Import JSON** — on `/workflows`, click **Import Workflow**, then upload a `.json` file or paste its contents. The JSON must contain a top-level `definition` with `nodes` and `edges` (plus optional `name`, `description`, `tags`, `version`, `exportedAt` — the exact shape produced when you export a workflow, so exports round-trip cleanly). A missing `name` defaults to `Imported Workflow`.

## Run it

**From the UI:** open the workflow and click **Run** (<kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd>). Unsaved changes are saved first.

**From the API:**

```bash
curl -s -X POST "http://localhost:3000/api/workflows/$WORKFLOW_ID/execute" \
  -H 'Content-Type: application/json' \
  -d '{"input": {}}'
```

The body must be valid JSON. Optional fields: `input` (data handed to the trigger node), `variables`, `envVars`, and `debug` (boolean — pauses at breakpoints and emits `debug:paused` events). Response:

```json
{ "success": true, "data": { "executionId": "…", "status": "running" } }
```

A `404` means the workflow ID doesn't exist. Save the `executionId`:

```bash
EXECUTION_ID=$(curl -s -X POST "http://localhost:3000/api/workflows/$WORKFLOW_ID/execute" \
  -H 'Content-Type: application/json' -d '{"input": {}}' | jq -r '.data.executionId')
```

## Watch it run

### Live: Server-Sent Events

```bash
curl -N "http://localhost:3000/api/executions/$EXECUTION_ID/stream"
```

The stream opens with a `connected` event, then emits one JSON object per event:

```
data: {"type":"connected","executionId":"…","timestamp":1755043200000}

data: {"type":"execution:start","executionId":"…","timestamp":1755043200100}

data: {"type":"node:start","executionId":"…","nodeId":"code-1","nodeName":"Say hello","timestamp":1755043200150}

data: {"type":"node:complete","executionId":"…","nodeId":"code-1","nodeName":"Say hello","durationMs":812,"output":{…},"timestamp":1755043200962}

data: {"type":"execution:complete","executionId":"…","timestamp":1755043201000}
```

Event types: `execution:start`, `node:start`, `node:complete`, `node:error`, `execution:complete`, `execution:error`, `execution:cancelled`, and `debug:paused` (debug mode only). Events are buffered server-side (up to 500 events, 5-minute TTL), so a subscriber that connects mid-run receives everything it missed. The editor uses this same stream to light up nodes on the canvas as they run.

### After the fact: the replay view

Open `http://localhost:3000/executions/{executionId}` for a DevTools-style step replay: every node transition with its input, output, logs, duration, prompt payloads (for LLM nodes), and errors.

### Programmatically: fetch the execution

```bash
curl -s "http://localhost:3000/api/executions/$EXECUTION_ID" | jq '.data.execution.status'
```

`GET /api/executions/{id}` returns the execution record (`status`, `workflowName`, `startedAt`, `completedAt`, `costUsd`) plus `steps` — one entry per executed node with `status` (`completed` / `failed` / `running` / `skipped`), `input`, `output`, formatted `logs`, `durationMs`, and `error` — and the raw `logs`.

To list all executions of a workflow:

```bash
curl -s "http://localhost:3000/api/workflows/$WORKFLOW_ID/executions?status=failed&pageSize=10"
```

Supported query params: `page`, `pageSize` (max 50), `status` (`completed` | `failed` | `running` | `all`), `sortBy` (`startedAt` | `status` | `triggerType` | `durationMs` | `nodeCount`), `sortOrder` (`asc` | `desc`).

## When it fails

A failed execution ends with an `execution:error` SSE event, `status: "failed"` on `GET /api/executions/{id}`, and the failing node's `error` in its replay step. Common first-run causes: an unreachable URL in an HTTP node, a code node exception (the traceback lands in the node's logs), or a missing `PANDASTACK_API_KEY` for microVM-backed nodes.

Once you've fixed the cause, retry it:

```bash
curl -s -X POST "http://localhost:3000/api/executions/$EXECUTION_ID/retry"
```

Retry starts a **new** execution with the same trigger type and input as the original (its metadata carries `retryOf` pointing at the failed run) and resolves any dead-letter-queue entries for the original. It only works on executions with status `failed` or `cancelled` — anything else returns `400`. The response contains `newExecution.id`, which you can stream and inspect exactly like the first run.

## Next steps

- **Add a webhook trigger** — create a webhook at `/webhooks` and fire your workflow with a plain HTTP request to `/api/webhooks/trigger/{path}`.
- **Put it on a schedule** — `POST /api/schedules` with a `cronExpression` to run it unattended.
- **Explore the node catalog** — browse the palette or [`lib/nodes/registry.ts`](../../lib/nodes/registry.ts): LLM/agent nodes, databases, integrations, transformations, and PandaStack browser automation.
- **See how execution works under the hood** — [`lib/execution/pandastack-workflow-runner.ts`](../../lib/execution/pandastack-workflow-runner.ts) is where nodes meet microVMs; the [PandaStack docs](https://docs.pandastack.ai) cover the sandbox layer.
- **Check what's coming** — [ROADMAP.md](../../ROADMAP.md); contributions welcome via [CONTRIBUTING.md](../../CONTRIBUTING.md).
