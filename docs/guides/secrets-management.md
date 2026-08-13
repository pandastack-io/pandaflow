# Secrets management

PandaFlow workflows call third-party APIs (OpenAI, Slack, Postgres, Stripe, …) from inside [PandaStack](https://pandastack.ai) microVMs. Secrets are how you get API keys and connection strings to those nodes without hardcoding them into workflow definitions.

This guide covers how secrets are stored, the `ENCRYPTION_KEY` requirement, creating secrets in the UI and via the API, how they resolve at execution time, rotation, and exactly where plaintext values do and do not travel.

Related: [README](../../README.md) · [Quickstart](../../QUICKSTART.md) · [.env.example](../../.env.example)

## What secrets are

A secret is a named value scoped to an **organization**. Every workflow execution in that org can use it; other orgs cannot.

Secrets live in the `credentials` table of your Postgres database. What's stored per secret:

| Column | Contents |
|---|---|
| `name` | Lookup key, unique per org (case-insensitive). Doubles as the env-var-style name nodes look for, e.g. `OPENAI_API_KEY` |
| `type` | Free-form label (`api_key`, `other`, …) — informational only |
| `description` | Optional |
| `encryptedData` | The value, encrypted — **plaintext is never written to the database** |
| `encryptionKeyId` | Encryption key version (currently always `v1`) |

Values are encrypted at rest with **AES-256-GCM** (`lib/secrets/crypto.ts`): a random 12-byte IV per encryption plus a GCM auth tag, stored together as a JSON blob `{"iv": "...", "tag": "...", "value": "..."}` (all base64). GCM is authenticated encryption — tampering with the ciphertext makes decryption fail rather than yield garbage.

## `ENCRYPTION_KEY` requirement

The AES key is derived from the `ENCRYPTION_KEY` environment variable (`lib/secrets/crypto.ts`):

- If it is exactly **64 hex characters** (32 bytes), it is used directly as the AES-256 key. This is the form you should use.
- Any other non-empty value is run through SHA-256 to derive a 32-byte key. Works, but weaker if the string is guessable.
- If unset, a **hardcoded dev fallback key** (`dev-encryption-key-do-not-use-in-production`) is used — anyone with a copy of your database can decrypt every secret. Never run a real deployment without setting it.

Generate and set one:

```bash
# .env / .env.local
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

Treat this key like a root credential:

- Back it up outside the database. Ciphertext without the key is unrecoverable — there is no reset path.
- Changing it does **not** re-encrypt existing rows; previously stored secrets become undecryptable (see [Rotation](#rotation) for the safe procedure).
- Don't commit it. `.env.example` ships a placeholder for this reason.

## Creating secrets

### In the UI (`/secrets`)

Open **`/secrets`** in the dashboard (the old `/credentials` path redirects there). You get a searchable provider catalog — OpenAI, Anthropic, Slack, Postgres, Pinecone, Stripe, and so on — grouped by category.

Each provider card defines the exact field names its workflow nodes look up (from `lib/credentials/providers.ts`). Saving a provider creates **one secret per field, named exactly after the field key** — e.g. connecting OpenAI stores a secret named `OPENAI_API_KEY`. That naming is the whole contract: nodes find credentials by these well-known names, so use the catalog rather than inventing your own names for built-in nodes.

Editing shows values masked; leaving a masked field untouched keeps the stored value. Clearing an optional field deletes that secret.

> The platform's own `PANDASTACK_API_KEY` is intentionally **not** in the catalog — it comes from the server's environment, not from org secrets.

### Via the API

Routes live in `app/api/secrets/route.ts` and `app/api/secrets/[id]/route.ts`. All of them resolve your org from the login session (`requireOrgId`), so from `curl` you need either:

- a self-hosted dev instance with `SKIP_AUTH=true` (requests map to the seed org — the examples below work as-is), or
- your NextAuth session cookie: add `-H "Cookie: authjs.session-token=..."` (copy it from your browser's dev tools).

There is no bearer-token auth on these routes today.

```bash
BASE=http://localhost:3000

# Create
curl -sS -X POST "$BASE/api/secrets" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "OPENAI_API_KEY",
    "value": "sk-proj-...",
    "type": "api_key",
    "description": "OpenAI key for prod workflows"
  }'
# → {"success":true,"data":{"id":"<uuid>","name":"OPENAI_API_KEY","type":"api_key",...}}
# 400 if name/value missing · 409 if the name already exists (case-insensitive)

# List — metadata only, values are never included
curl -sS "$BASE/api/secrets"

# Get one — this DOES return the decrypted value (it backs the edit UI)
curl -sS "$BASE/api/secrets/<id>"

# Update — PATCH or PUT, partial; sending "value" re-encrypts it
curl -sS -X PATCH "$BASE/api/secrets/<id>" \
  -H 'Content-Type: application/json' \
  -d '{"value": "sk-proj-NEW"}'

# Delete
curl -sS -X DELETE "$BASE/api/secrets/<id>"
```

All responses use the `{"success": true, "data": ...}` / `{"success": false, "error": "..."}` envelope.

## Referencing secrets in workflow nodes

Nodes reference secrets **by name convention, not by template syntax**. There is no `{{secrets.FOO}}` — the `{{...}}` interpolation in node config resolves *node outputs and workflow variables only* (`ctx.resolve` in `lib/execution/workflow-python-runtime.ts`).

What actually happens on each run (`lib/execution/pandastack-workflow-runner.ts`):

1. `loadSecrets(organizationId)` reads **all** of the org's `credentials` rows and decrypts them into a `{name: plaintext}` map. Rows that fail to decrypt (e.g. after a bad key change) are **silently skipped**.
2. The runner creates a fresh PandaStack sandbox (`code-interpreter`, or `browser` for Playwright/scrape nodes) via `@pandastack/sdk`.
3. It writes two files into the guest: the Python runtime (`/tmp/workflow_runtime.py`) and an env script (`/tmp/workflow_env.sh`) exporting the payload as base64-encoded env vars — the secrets map travels as **`WORKFLOW_SECRETS`** alongside `WORKFLOW_DEFINITION`, `WORKFLOW_INPUT`, `WORKFLOW_VARIABLES`, and `WORKFLOW_ENV_VARS`.
4. The workflow runs as `sh -lc '. /tmp/workflow_env.sh && python3 -u /tmp/workflow_runtime.py'`. Inside the guest, the runtime base64-decodes `WORKFLOW_SECRETS` back into a dict.
5. When a node needs a credential it calls `get_secret("<NAME>", ctx, <inline config value>)`, which resolves in this order:
   1. an inline value in the node's config (e.g. an `apiKey` field typed directly into the node) — wins if set,
   2. the org secret with that exact name,
   3. workflow env-var overrides (`WORKFLOW_ENV_VARS`),
   4. the guest's own `os.environ`.
6. The sandbox is killed in a `finally` block — the microVM and everything written inside it are destroyed whether the run succeeded or failed.

So to make the OpenAI nodes work, create a secret named `OPENAI_API_KEY` and you're done. Names the built-in nodes look for include (see `get_secret` calls in `lib/execution/workflow-python-runtime.ts` for the full set):

| Node family | Secret name(s) |
|---|---|
| OpenAI (chat, embeddings, classify, …) | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Slack | `SLACK_WEBHOOK_URL` or `SLACK_BOT_TOKEN` |
| Discord | `DISCORD_WEBHOOK_URL` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| Email (SMTP) | `SMTP_HOST`, `SMTP_PORT`, … |
| SendGrid | `SENDGRID_API_KEY` |
| Postgres | `POSTGRES_URL` |
| MongoDB | `MONGODB_URI` |
| Redis | `REDIS_URL` |
| Stripe | `STRIPE_SECRET_KEY` |
| Notion | `NOTION_API_KEY` |
| Airtable | `AIRTABLE_API_KEY` |

Two consequences worth knowing:

- **Every execution receives the org's entire secret map**, not just the ones its nodes use. Keep unrelated environments (staging vs prod) in separate orgs if that matters to you.
- Secrets resolve **fresh on every run** — an updated value applies to the next execution automatically, with no redeploy.

## Rotation

### Rotating a secret's value

Just update it — the next execution picks it up:

```bash
curl -sS -X PATCH "$BASE/api/secrets/<id>" \
  -H 'Content-Type: application/json' \
  -d '{"value": "<new value>"}'
```

Rotate at the provider first (issue the new key), update the secret, then revoke the old key.

### Rotating `ENCRYPTION_KEY` (the master key)

There is **no multi-key support**: `encryptionKeyId` is hardcoded to `v1`, and `decrypt` rejects anything else. Swapping `ENCRYPTION_KEY` does not re-encrypt existing rows — after a swap, `loadSecrets` silently drops every old row, and workflows start failing with "key not configured" errors from nodes.

Safe procedure — export plaintexts *while the old key is still active*, swap, then re-save (re-saving re-encrypts with the current key):

```bash
BASE=http://localhost:3000

# 1. WITH THE OLD KEY still configured: export id → value for every secret
curl -sS "$BASE/api/secrets" | jq -r '.data[].id' | while read -r id; do
  curl -sS "$BASE/api/secrets/$id" | jq -c '{id: .data.id, value: .data.value}'
done > /tmp/secrets-export.jsonl

# 2. Set the new ENCRYPTION_KEY in your env file and restart PandaFlow
#    ENCRYPTION_KEY=$(openssl rand -hex 32)

# 3. WITH THE NEW KEY active: re-save every value (PUT re-encrypts)
while read -r line; do
  id=$(jq -r '.id' <<<"$line")
  jq -c '{value: .value}' <<<"$line" | curl -sS -X PUT "$BASE/api/secrets/$id" \
    -H 'Content-Type: application/json' -d @-
done < /tmp/secrets-export.jsonl

# 4. Verify a run works, then shred the export
rm -P /tmp/secrets-export.jsonl 2>/dev/null || rm -f /tmp/secrets-export.jsonl
```

(Add your session cookie header to the `curl` calls on an authed deployment, as in [Via the API](#via-the-api).)

## What never leaves the box

Where plaintext secret values exist, and where they don't:

**Never leaves your deployment:**

- **`ENCRYPTION_KEY`** stays in the PandaFlow server's environment. It is never stored in the database, never returned by any API, and never sent to a sandbox.
- **The database only ever holds ciphertext.** A leaked dump is useless without the key (assuming you set a real key — see the dev-fallback warning above).
- **List responses contain no values.** `GET /api/secrets` returns names and metadata only; plaintext comes back solely from an explicit `GET /api/secrets/{id}` by an authenticated member of the owning org.

**Where plaintext does exist, briefly:**

- In PandaFlow server memory while an execution is being prepared (`loadSecrets`).
- Inside the execution microVM: the decrypted map is delivered as `WORKFLOW_SECRETS` via `/tmp/workflow_env.sh` and the runtime's process environment. This is the point of the architecture — the untrusted workflow code runs in a hardware-isolated Firecracker microVM, not on your PandaFlow host, and the sandbox (VM, filesystem, memory) is destroyed in the runner's `finally` block after every run, success or failure.

**One thing to watch yourself:** node *outputs* are persisted to `execution_logs` and streamed to the UI over SSE. If a workflow node echoes a secret into its output (e.g. a code node printing `os.environ`), that value ends up in your logs in plaintext. Don't build workflows that emit credentials.
