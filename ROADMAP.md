# PandaFlow Roadmap

> **PandaFlow** is an open source AI agent workflow builder by [PandastackIO Inc.](https://pandastack.io). This roadmap reflects what's been shipped, what's actively being worked on, and where the project is headed. It is public and community-driven.

---

## ✅ Shipped (v0.1 — Foundation)

### Core Builder
- [x] Visual drag-and-drop workflow canvas (React Flow)
- [x] 160+ node types across 12 categories
- [x] Bezier edge connections with port validation
- [x] Floating node palette with search + Space shortcut
- [x] Collapsible sidebar (56px icon / 240px full, persisted)
- [x] Compact icon-only topbar (Save, History, Export, Publish)
- [x] Workflow versioning

### Execution Engine
- [x] Sandflare microVM isolated execution
- [x] Local `WorkflowExecutor` for development / mock mode
- [x] Real-time SSE execution status streaming
- [x] Execution replay debugger (DevTools-style step timeline)
- [x] Input / output / logs / prompt inspector per step
- [x] Cost tracking per node and per execution

### Agent OS
- [x] Deploy any workflow as a persistent named Agent
- [x] Agent lifecycle: start / stop / pause / restart
- [x] Identity token (`agt_...`) for external API invocation
- [x] `POST /api/agents/invoke` — invoke agent via Bearer token
- [x] Agent cron scheduling (visual cron editor + presets)
- [x] Episodic memory and key-value store per agent
- [x] Agent cost intelligence dashboard (7-day chart, top nodes)
- [x] Redis pub/sub message bus

### Node Library
- [x] LLM: OpenAI GPT-4/4o, Claude (Anthropic), Mistral, Groq, Ollama
- [x] Triggers: Manual, Webhook, Schedule, Chat
- [x] Sandflare execution: Python, JavaScript, Bash, Go, Rust
- [x] Data: HTTP Request, PostgreSQL, Redis, Queue
- [x] Document Loaders: CSV, JSON, PDF, Webpage, GitHub, Notion, Google Drive, Airtable, RSS, Sitemap
- [x] Embeddings: OpenAI, Cohere, HuggingFace
- [x] Vector Stores: Pinecone, Qdrant, Chroma, Weaviate, pgvector, Redis
- [x] Tools: Calculator, Web Search, Web Browser, DateTime
- [x] Analytics / Observability: LangFuse, Analytics Log
- [x] Control flow: Conditional Branch, Loop, Switch, Error Handler, Retry

### Templates
- [x] 130+ production-ready templates
- [x] 15 complex enterprise templates (Competitor Intelligence, RAG Pipeline, Code Reviewer, etc.)
- [x] Import template → new workflow in one click

### Auth & Multi-tenancy
- [x] Email + password registration / login
- [x] Google SSO (OAuth 2.0 via NextAuth v5)
- [x] Session middleware protecting all app routes
- [x] Organizations and role-based access (owner / admin / member / viewer)
- [x] Secrets vault with encryption
- [x] API key management

### Developer UX
- [x] Node config panels with type-specific UIs (LLM model pickers, sliders, secret linking)
- [x] Variable inspector panel (`{{node.field}}` references)
- [x] Error handling accordion per node (retry, custom branch)
- [x] "Generate with AI" — describe a workflow in plain text
- [x] Connection highlight (compatible ports glow on drag)

### Infrastructure
- [x] PostgreSQL via Drizzle ORM (clean migrations)
- [x] Redis for pub/sub and caching
- [x] Temporal worker for durable orchestration
- [x] Mock sandbox provider for zero-config local dev

---

## 🚧 In Progress (v0.2 — Polish & Depth)

- [ ] Marketing homepage (PandaFlow branding, PandastackIO Inc. footer)
- [ ] Full auth wiring — replace hardcoded org UUID with real session org
- [ ] Node output type system — typed ports (string, number, JSON, file)
- [ ] Live log streaming on agent detail page during execution
- [ ] Agent cron scheduler wired to external cron endpoint

---

## 🗓️ Planned (v0.3 — Collaboration)

### Team Features
- [ ] Invite team members via email
- [ ] Per-workflow permissions (view / edit / run)
- [ ] Shared secrets across team
- [ ] Activity feed and audit log UI

### Observability
- [ ] Native LangFuse integration (traces auto-sent)
- [ ] Execution diff between runs (what changed?)
- [ ] Node-level latency flame graph
- [ ] Alert rules on failure rate / cost threshold

### Developer Experience
- [ ] PandaFlow CLI (`pandaflow deploy`, `pandaflow run`, `pandaflow logs`)
- [ ] Workflow-as-code export (YAML / JSON roundtrip)
- [ ] Git-backed workflow storage (push/pull from repo)
- [ ] VS Code extension for node authoring

---

## 🔮 Future (v0.4+ — Scale)

### Advanced Agent Capabilities
- [ ] Multi-agent orchestration (agents calling agents)
- [ ] Long-running agents with interrupt / resume
- [ ] Human-in-the-loop nodes (approval gates, form inputs)
- [ ] Agent marketplace (publish and install community agents)

### New Node Categories
- [ ] Output Parsers (JSON, CSV, Markdown, Pydantic)
- [ ] Chain nodes (LLMChain, ConversationalChain)
- [ ] Computer use / browser automation (Playwright, Puppeteer)
- [ ] Voice I/O (Whisper STT, ElevenLabs TTS)
- [ ] Image generation (DALL·E, Stable Diffusion)
- [ ] Database migrations as workflow nodes

### Infrastructure
- [ ] Horizontal scaling of Temporal workers
- [ ] Bring-your-own Sandflare key per organization
- [ ] Self-hosted Sandflare-compatible runtime
- [ ] Docker Compose one-command self-host
- [ ] Helm chart for Kubernetes deployment

### Ecosystem
- [ ] Public template registry (community submissions)
- [ ] Node SDK — write custom nodes in TypeScript and publish to npm
- [ ] Webhook marketplace (Zapier / Make.com-style integrations)
- [ ] Pricing / billing module for SaaS deployments

---

## 💡 Community Ideas (Backlog)

These are ideas raised by users or contributors that haven't been prioritized yet:

- Mobile-responsive canvas view
- Dark/light theme toggle
- Workflow A/B testing (split traffic between two definitions)
- Natural language query over execution history
- Slack / Discord bot for triggering workflows
- Budget caps per agent (auto-pause when cost exceeds limit)

---

## Contributing

PandaFlow is MIT licensed and welcomes contributions at every level:

- **🐛 Bug reports** — Open an issue on [GitHub](https://github.com/pandastack-io/pandaflow)
- **🌱 New nodes** — See `lib/nodes/registry.ts` and `lib/execution/workflow-executor.ts`
- **📝 Templates** — Add to `lib/templates/templates-data.ts`
- **📖 Docs** — Improve `QUICKSTART.md` or write guides
- **🎨 UI** — Components live in `components/`, pages in `app/`

Before contributing, please read [CONTRIBUTING.md](./CONTRIBUTING.md) _(coming soon)_.

---

_Last updated: May 2026 · Maintained by [PandastackIO Inc.](https://pandastack.io)_
