# Self-host PandaFlow in 15 minutes

PandaFlow is a Next.js 16 app backed by PostgreSQL and Redis. Workflow nodes execute in
[PandaStack](https://pandastack.ai) microVMs, so you need a PandaStack API key (or the
explicit mock opt-out for offline development). This guide takes you from a bare host to a
running production instance.

## Prerequisites

- **Node.js 20+**
- **PostgreSQL 16** — reachable via a connection string
- **Redis 7** — reachable via a connection string (the app throws at startup if `REDIS_URL` is unset; see [`lib/redis/index.ts`](../../lib/redis/index.ts))
- A **PandaStack API key** (`pds_...`) from the [pandastack.ai](https://pandastack.ai) dashboard's API Tokens page — or `mock-api-key` for offline dev

## Clone & install

```bash
git clone https://github.com/pandastack-io/pandaflow.git
cd pandaflow
npm install
cp .env.example .env.local
```

All configuration lives in `.env.local` (Next.js loads it automatically in both dev and
prod). One exception is noted in [Database setup](#database-setup).

## Environment reference

### Required

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/pandaflow` | PostgreSQL 16 connection string. Used by the app (Drizzle ORM) and by `npm run db:migrate` (via [`drizzle.config.ts`](../../drizzle.config.ts), which reads `.env.local`). |
| `REDIS_URL` | `redis://localhost:6379` | Redis 7. Import-time hard requirement — any route touching Redis (agent message bus, health monitor, execution approvals, memory nodes) throws `REDIS_URL environment variable is not set` without it. |
| `NEXTAUTH_SECRET` | output of `openssl rand -base64 32` | Signs NextAuth v5 JWT sessions. (`AUTH_SECRET` is accepted as an alias by NextAuth; `.env.example` uses `NEXTAUTH_SECRET`.) |
| `ENCRYPTION_KEY` | output of `openssl rand -hex 32` | AES-256-GCM key for the encrypted secrets store ([`lib/secrets/crypto.ts`](../../lib/secrets/crypto.ts)). **Must be exactly 64 hex characters** — anything else is silently hashed into a fallback key (see warning below). |
| `PANDASTACK_API_KEY` | `pds_...` | **The app refuses to start without it.** [`instrumentation.ts`](../../instrumentation.ts) validates it on server startup (dev and prod) and throws otherwise. For fully offline development without real sandboxes, opt in to the mock provider explicitly with `PANDASTACK_API_KEY=mock-api-key` — any `mock-` prefixed key selects the mock provider ([`lib/pandastack/manager.ts`](../../lib/pandastack/manager.ts)); no real code execution happens. |

Generate the two keys:

```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

> **Warning — set `ENCRYPTION_KEY` correctly before storing any secrets.** If the value
> is missing or not 64 hex chars, `lib/secrets/crypto.ts` falls back to
> `sha256(<value or a hard-coded dev string>)`. Everything still *works*, but secrets get
> encrypted under that derived key — fixing the variable later makes previously stored
> secrets undecryptable. There is no key-rotation tooling; back this key up.

### Optional

| Variable | Default | Notes |
|---|---|---|
| `NEXTAUTH_URL` | `http://localhost:3000` | Public URL of your deployment. Set it to your real origin behind a reverse proxy. |
| `PANDASTACK_API` | `https://api.pandastack.ai` | PandaStack control-plane base URL. Only change if you self-host PandaStack itself. |
| `SKIP_AUTH` | unset | `true` bypasses all auth — see [Auth choices](#auth-choices). Never set in multi-user production. |
| `SCHEDULER_SECRET` | unset | Shared secret for the agent scheduler tick endpoint — see [Agent scheduler wiring](#agent-scheduler-wiring). Without it the tick endpoint returns `500`. |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | unset | Enables GitHub OAuth sign-in (provider only registered when both are set — [`lib/auth/config.ts`](../../lib/auth/config.ts)). |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | unset | Enables Google OAuth sign-in (same pattern). |
| `RESEND_API_KEY` / `RESEND_FROM` | unset | Enables magic-link email sign-in via Resend. |
| `OPENAI_API_KEY` | unset | Server-side default for OpenAI LLM nodes. |
| `ANTHROPIC_API_KEY` | unset | Server-side default for Claude LLM nodes. |

Per-workflow provider credentials can also be stored in the encrypted secrets store from
the UI instead of environment variables.

## Database setup

Create the database, then run migrations (SQL files live in [`migrations/`](../../migrations/)):

```bash
createdb pandaflow          # or however you provision the DB
npm run db:migrate          # drizzle-kit migrate — reads DATABASE_URL from .env.local
```

**Seeding is automatic.** On every server startup, [`instrumentation.ts`](../../instrumentation.ts)
calls `seedDatabase()` ([`lib/db/seed.ts`](../../lib/db/seed.ts)), which inserts the
default organization if it doesn't exist and is a no-op afterwards:

- id `00000000-0000-0000-0000-000000000000`, name `Default Organization`, slug `default`, billing tier `free`

This seed org is what all requests use in `SKIP_AUTH=true` mode.

You can also seed manually, but note the gotcha: `npm run db:seed` runs
`tsx --env-file=.env scripts/seed.ts` — it reads **`.env`**, not `.env.local`. Either
create a `.env` containing `DATABASE_URL`, or just rely on the automatic startup seeding.

## Run modes

### Development

```bash
npm run dev          # next dev --turbopack, listens on http://localhost:3000
```

### Production

```bash
npm run build        # next build
npm run start        # next start, listens on :3000 (append -- -p <port> to change)
```

Both modes run the startup validation and auto-seed from `instrumentation.ts`. If the
process exits immediately with `PANDASTACK_API_KEY is not set`, that is the intended
guard — set the key (or `mock-api-key`) and restart.

Run `npm run start` under a supervisor (systemd, PM2, a container orchestrator). A minimal
systemd unit:

```ini
[Unit]
Description=PandaFlow
After=network-online.target postgresql.service redis.service

[Service]
WorkingDirectory=/opt/pandaflow
ExecStart=/usr/bin/npm run start
Restart=always
EnvironmentFile=/opt/pandaflow/.env.local

[Install]
WantedBy=multi-user.target
```

> **Single instance only.** Live execution events are delivered through an in-process
> emitter ([`lib/execution/execution-emitter.ts`](../../lib/execution/execution-emitter.ts)),
> not Redis pub/sub. If you run multiple app replicas behind a load balancer, SSE
> subscribers connected to one replica will miss events from executions running on
> another. Run one instance.

## Auth choices

### Option A: single-user mode (`SKIP_AUTH=true`)

```bash
SKIP_AUTH=true
```

[`middleware.ts`](../../middleware.ts) lets every request through, and all data is scoped
to the seed `Default Organization` ([`lib/auth/get-org-id.ts`](../../lib/auth/get-org-id.ts)).
No sign-in page, no users. Suitable for a personal instance on a trusted network —
**anyone who can reach the port has full access**, so keep it behind a VPN/firewall or
add auth at the reverse proxy.

### Option B: NextAuth (multi-user)

Leave `SKIP_AUTH` unset. [`middleware.ts`](../../middleware.ts) then requires a session
for the app and API routes it matches (`/workflows`, `/agents`, `/executions`, `/secrets`,
`/settings`, `/templates` and their `/api/*` counterparts). Available sign-in methods
(all in [`lib/auth/config.ts`](../../lib/auth/config.ts)):

- **Email + password** (always on). Create the first account via the API:

  ```bash
  curl -X POST https://your-host/api/auth/register \
    -H 'Content-Type: application/json' \
    -d '{"name": "Ada Lovelace", "email": "ada@example.com", "password": "at-least-8-chars"}'
  ```

  Returns `201` with the created user; each registration also creates a personal
  organization with the user as `owner`. Then sign in at `/sign-in`. Passwords are
  bcrypt-hashed (cost 12); there is no email-verification step for password signups.
- **Google / GitHub OAuth** — enabled only when the corresponding
  `AUTH_GOOGLE_*` / `AUTH_GITHUB_*` pair is set. Set the OAuth callback URL to
  `https://your-host/api/auth/callback/google` (or `/github`).
- **Magic-link email** — enabled only when `RESEND_API_KEY` is set (optionally
  `RESEND_FROM`).

There is no public-signup toggle: as long as the instance is reachable, `POST
/api/auth/register` is open. Restrict it at the reverse proxy if you don't want open
registration.

## Agent scheduler wiring

Agent cron schedules (5-field cron expressions, validated with `croner`) are **not**
executed by an in-process timer. Something external must tick the scheduler endpoint once
per minute; each tick finds due agents and starts their workflows, with per-minute
dedupe so re-ticks inside the same minute don't double-fire
([`lib/agents/scheduler.ts`](../../lib/agents/scheduler.ts)).

1. Set a secret in `.env.local`:

   ```bash
   SCHEDULER_SECRET=$(openssl rand -hex 32)
   ```

2. Add a system crontab entry (or any external scheduler) that calls
   `GET /api/agents/scheduler/tick` with the `x-scheduler-secret` header:

   ```cron
   * * * * * curl -fsS -H "x-scheduler-secret: YOUR_SECRET" https://your-host/api/agents/scheduler/tick > /dev/null
   ```

Responses ([`app/api/agents/scheduler/tick/route.ts`](../../app/api/agents/scheduler/tick/route.ts)):
`200` with `{"success": true, "data": ...}` on a successful tick, `401` on a missing/wrong
header, `500` with `SCHEDULER_SECRET is not configured` if you skipped step 1.

> **Known limitation with NextAuth mode:** the auth middleware's matcher includes
> `/api/agents/:path*`, so when `SKIP_AUTH` is not `true`, an external cron call to the
> tick endpoint is rejected with `401 Unauthorized` by [`middleware.ts`](../../middleware.ts)
> *before* the scheduler secret is checked. Until this is fixed upstream, either run
> single-user mode if you rely on agent schedules, or exclude
> `/api/agents/scheduler/tick` from the `matcher` in `middleware.ts`.

## Reverse proxy + SSE gotchas

PandaFlow streams live data over Server-Sent Events from three endpoints:

- `GET /api/executions/{id}/stream` — live execution/node events
- `GET /api/chat/{id}` — chat streaming
- `POST /api/agents/invoke` — agent invocation streaming

SSE responses are long-lived and must not be buffered. The stream route already sends
`X-Accel-Buffering: no` and `Cache-Control: no-cache`, but your proxy must cooperate.
nginx example:

```nginx
server {
    listen 443 ssl;
    server_name pandaflow.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE: no buffering, no premature timeouts
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_set_header Connection '';
    }
}
```

Checklist for any proxy (Caddy, Traefik, an ALB, Cloudflare):

- Disable response buffering on the `/api/*` SSE paths (or globally).
- Raise idle/read timeouts well above your longest workflow execution — a timeout
  mid-stream silently drops live updates in the UI.
- Use HTTP/1.1 or HTTP/2 to the upstream; don't force `Connection: close`.
- Set `NEXTAUTH_URL` to the public `https://` origin so OAuth callbacks and cookies work.
- Remember the single-instance constraint from [Run modes](#run-modes) — don't put SSE
  behind a multi-replica round-robin.

## Upgrade & backup notes

**Upgrading:**

```bash
git pull
npm install
npm run db:migrate       # apply any new migrations before starting the new build
npm run build
systemctl restart pandaflow   # or your supervisor's restart
```

Migrations are plain forward-only SQL in [`migrations/`](../../migrations/); run them
while the old version is stopped (or tolerate a brief window of schema drift). The
startup seed is idempotent, so restarts are safe.

**Backups:**

- **PostgreSQL is the source of truth** — workflows, executions, users, agents,
  encrypted secrets. Back it up on a schedule:

  ```bash
  pg_dump "$DATABASE_URL" | gzip > pandaflow-$(date +%F).sql.gz
  ```

- **Back up `ENCRYPTION_KEY` and `NEXTAUTH_SECRET` alongside the database.** Secrets in
  the dump are AES-256-GCM ciphertext; a restore without the original `ENCRYPTION_KEY`
  cannot decrypt them. Losing `NEXTAUTH_SECRET` merely invalidates active sessions.
- **Redis is not durable state** — it holds the agent message bus, health/heartbeat
  data, pending debug/approval state, and memory-node caches. Losing it drops in-flight
  coordination (e.g. pending approvals) but nothing that a backup needs to cover.
- Sandboxes are ephemeral by design: each execution provisions a fresh PandaStack microVM
  and tears it down on completion, so there is no sandbox state to back up.

## See also

- [README](../../README.md) — feature overview and tech stack
- [QUICKSTART](../../QUICKSTART.md) — development quickstart and project structure
- [CONTRIBUTING](../../CONTRIBUTING.md) — development workflow and testing
- [PandaStack docs](https://docs.pandastack.ai) — the microVM execution layer
