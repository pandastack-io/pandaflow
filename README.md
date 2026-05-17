# PandaFlow

> Open source AI agent visual workflow builder by [PandastackIO Inc.](https://pandastack.io)

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-pandastack--io%2Fpandaflow-black?logo=github)](https://github.com/pandastack-io/pandaflow)

Build, deploy, and orchestrate AI agents visually. Connect LLMs, databases, APIs, and code execution nodes on a drag-and-drop canvas. Powered by [Sandflare.io](https://sandflare.io) isolated microVM execution.

## Features

- 🎨 **Visual Workflow Builder** — Drag-and-drop canvas powered by React Flow
- ⚡ **Isolated Code Execution** — Run Python, Node.js, Go, and Bash in [Sandflare microVMs](https://docs.sandflare.io/sandbox) with [browser automation](https://docs.sandflare.io/templates) support
- 🤖 **160+ Nodes** — LLMs, databases, APIs, webhooks, transformations, and more
- 🔄 **Real-time Monitoring** — Live execution tracking via Server-Sent Events
- 🔐 **Secrets Management** — Encrypted per-organization secret store
- 📋 **Templates** — Pre-built multi-node workflow templates to get started fast
- 🔌 **Extensible** — Add custom nodes by extending the node registry

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS, shadcn/ui, React Flow |
| Backend | Next.js API Routes, Drizzle ORM |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Execution | [Sandflare](https://docs.sandflare.io) microVMs ([browser-agent](https://docs.sandflare.io/templates/available#browser-agent) + [code-interpreter](https://docs.sandflare.io/templates/available#code-interpreter) templates) |
| Auth | NextAuth v5 (email + Google OAuth) |
| Infrastructure | [Specific](https://specific.app) |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16
- Redis 7

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/pandastack-io/pandaflow.git
cd pandaflow

# 2. Install dependencies
npm install

# 3. Copy environment variables
cp .env.example .env.local

# 4. Run database migrations
npm run db:migrate

# 5. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see PandaFlow running locally.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NEXTAUTH_SECRET` | Random secret for NextAuth session signing |
| `ENCRYPTION_KEY` | 32-byte hex key for secrets encryption |
| `SANDFLARE_API_KEY` | [Sandflare API key](https://docs.sandflare.io/api-keys) (use `mock-api-key` for local dev) |
| `AUTH_GOOGLE_ID` | Google OAuth client ID (optional) |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret (optional) |
| `SKIP_AUTH` | Set to `true` to bypass auth in local dev |

## Deploy on Pandastack.io

The easiest way to deploy PandaFlow is via **[Pandastack.io](https://pandastack.io)** — the managed cloud platform by PandastackIO Inc. that runs PandaFlow with enterprise-grade isolation, automatic scaling, and a managed control plane backed by [Sandflare microVMs](https://www.sandflare.io).

> ☁️ **PandaFlow Cloud is coming soon.** Self-host today using the instructions above.

For self-hosting on your own infrastructure, see [QUICKSTART.md](./QUICKSTART.md).

---

## How PandaFlow Uses Sandflare

PandaFlow executes all workflow nodes in isolated [Sandflare microVMs](https://docs.sandflare.io) for security and performance:

- **[Code Interpreter](https://docs.sandflare.io/templates/available#code-interpreter)** — Python, Node.js, Go code execution with popular libraries pre-installed
- **[Browser Agent](https://docs.sandflare.io/templates/available#browser-agent)** — Playwright automation for web scraping and browser testing
- **[Sandbox Lifecycle](https://docs.sandflare.io/sandbox/lifecycle)** — Ephemeral sandboxes with automatic cleanup (TTL: 2 hours)
- **[Execution API](https://docs.sandflare.io/execution/commands)** — Run commands via `/exec`, `/run/python`, or `/run/node` endpoints

Each workflow execution creates a fresh sandbox, runs all nodes sequentially, streams results via SSE, and automatically terminates on completion. See [`lib/execution/sandflare-workflow-runner.ts`](./lib/execution/sandflare-workflow-runner.ts) for implementation details.

## Contributing

PandaFlow is MIT licensed and welcomes contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for what's shipped, in progress, and planned.

## License

[MIT](./LICENSE) · © 2025 PandastackIO Inc.
