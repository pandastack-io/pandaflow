# Copilot Instructions

## Commands

```bash
# Development
npm run dev            # Next.js dev server with Turbopack (localhost:3000)
npm run build          # Production build
npm run lint           # ESLint

# Database (Drizzle)
npm run db:generate    # Generate migrations from schema changes
npm run db:migrate     # Run pending migrations
npm run db:push        # Push schema directly (dev only)
npm run db:studio      # Open Drizzle Studio


# Tests
npm run test:unit      # Run all unit tests (Vitest, one-shot)
npm run test           # Vitest in watch mode
npm run test:e2e       # Playwright E2E tests (requires running dev server)
npm run test:coverage  # Vitest with coverage

# Run a single unit test file
npx vitest run tests/unit/workflow-store.test.ts

# Run a single E2E test file
npx playwright test tests/e2e/workflows-page.spec.ts
```

## Architecture

This is an **AI agent visual workflow builder** — a Next.js 16 app where users build workflows by connecting nodes in a React Flow canvas. Workflows execute in PandaStack microVMs (isolated code execution) with a durable checkpointing TypeScript executor.

### Request Flow

1. **UI canvas** (`components/workflow/`) — React Flow canvas backed by Zustand store (`lib/stores/workflow-store.ts`). Users drag nodes from a panel, connect them, configure via side panel.
2. **Workflow definition** — Serialized as `{ nodes: Node[], edges: Edge[] }` JSON stored in `workflows.definition` (PostgreSQL via Drizzle ORM).
3. **Execution** — `POST /api/executions` → `WorkflowExecutor` (`lib/execution/workflow-executor.ts`) traverses the DAG, runs each node, resolves data between nodes.
4. **Code execution nodes** (`pandastack.*`) — Routed through `SandboxManager` (`lib/pandastack/manager.ts`) → either real PandaStack API or a local mock provider.
5. **Real-time status** — Execution progress streamed via SSE (Server-Sent Events).

### Key Layers

| Layer | Location |
|---|---|
| DB schema + relations | `lib/db/schema.ts` |
| Node type definitions | `types/nodes.ts` |
| Node registry (metadata + Zod schemas) | `lib/nodes/registry.ts` |
| Workflow canvas state | `lib/stores/workflow-store.ts` |
| Workflow execution engine | `lib/execution/workflow-executor.ts` |
| PandaStack sandbox abstraction | `lib/pandastack/` |
| API routes | `app/api/` |
| Auth | `lib/auth/config.ts` (NextAuth v5 beta) |

## Key Conventions

### Node Type System

Node types use dot-notation strings: `<category>.<name>` (e.g. `trigger.manual`, `pandastack.python`, `ai.llm`). The enum `NodeType` in `types/nodes.ts` is the source of truth. The `nodeRegistry` in `lib/nodes/registry.ts` maps each type to its metadata and Zod config schema.

When adding a new node type:
1. Add the enum value to `NodeType` in `types/nodes.ts`
2. Add a registry entry to `lib/nodes/registry.ts` (type, category, name, icon, configSchema, inputs/outputs)
3. Add execution logic in `lib/execution/workflow-executor.ts`

### API Response Shape

All API routes return `{ success: boolean, data?: T, error?: string }`. Use `NextResponse.json()` with this shape.

### PandaStack Provider Selection

`SandboxManager` auto-selects: if `PANDASTACK_API_KEY` is set and not prefixed with `mock-`, it uses the real PandaStack API. Otherwise it falls back to the local `MockSandboxProvider`. Set `PANDASTACK_API_KEY=mock-api-key` in `.env.local` for local dev.

### Database

Schema is defined in `lib/db/schema.ts` using Drizzle ORM. Always run `npm run db:generate` after schema changes, then `npm run db:migrate`. Use `db:push` only for rapid local iteration — never in CI/production.

Organizations are multi-tenant top-level entities. Most tables have an `organizationId` FK. The hardcoded `'00000000-0000-0000-0000-000000000000'` org UUID appears in several API routes as a TODO (auth not fully wired yet).

### State Management

Zustand is used only for the workflow canvas state (`useWorkflowStore`). Server state (workflows list, executions) is fetched via TanStack Query.

### Tests

- Unit tests live in `tests/unit/`, co-located by feature
- E2E tests live in `tests/e2e/` (Playwright), run against `localhost:3000`
- Vitest uses `jsdom` environment and path alias `@/` → project root
- Setup file: `tests/setup.ts`

### Environment Variables

Copy `.env.example` to `.env.local`. Required: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`. PandaStack and LLM keys are optional — the app uses mock providers when absent.
