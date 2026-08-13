# Quick Start Guide

## What We've Built (Phase 1 Foundation - Week 1)

✅ **Complete project foundation** for an enterprise-grade AI agent workflow builder

### Implemented Components

#### 1. **Infrastructure Setup**
- ✅ Next.js 16 with TypeScript and Turbopack
- ✅ Specific configuration for PostgreSQL, Redis, Temporal, and S3 storage
- ✅ Database schema with Drizzle ORM (15+ tables)
- ✅ Redis client with pub/sub support
- ✅ NextAuth.js v5 authentication setup

#### 2. **Core UI Framework**
- ✅ Enterprise design system with Tailwind CSS
- ✅ shadcn/ui component library (Button, Card, etc.)
- ✅ Main layout with sidebar navigation
- ✅ Responsive design with dark mode support

#### 3. **Workflow Builder**
- ✅ React Flow integration for visual canvas
- ✅ Basic workflow canvas component
- ✅ Landing page with features showcase
- ✅ Workflows list page
- ✅ New workflow editor page

#### 4. **Database Schema**
Complete PostgreSQL schema including:
- Organizations & Multi-tenancy
- Users & Teams
- Workflows & Versions
- Executions & Logs
- Node Registry
- Credentials (encrypted)
- Webhooks
- Audit Logs
- Usage Metrics

## Running the Project

### Option 1: Using Specific (Recommended)

```bash
# Start all infrastructure services
specific dev

# The app will be available at http://localhost:3000
```

This will automatically start:
- PostgreSQL database
- Redis cache
- Temporal workflow engine
- Next.js dev server
- S3-compatible storage

### Option 2: Manual Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your database URLs

# 3. Push database schema
npm run db:push

# 4. Start development server
npm run dev
```

## Available Commands

```bash
# Development
npm run dev              # Start dev server with Turbopack
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run db:generate      # Generate migrations from schema
npm run db:migrate       # Run migrations
npm run db:push          # Push schema directly (dev only)
npm run db:studio        # Open Drizzle Studio

# Workers
npm run build:worker     # Build Temporal worker
npm run worker           # Run worker

# Infrastructure (with Specific)
specific dev             # Start all services
specific deploy          # Deploy to production
specific check           # Validate configuration
```

## Project Structure

```
ai-agent-builder/
├── app/                     # Next.js app (pages & API routes)
│   ├── workflows/          # Workflow pages
│   ├── executions/         # Execution monitoring
│   ├── templates/          # Template marketplace
│   └── settings/           # User/org settings
│
├── components/             # React components
│   ├── ui/                # shadcn/ui components
│   ├── workflow/          # Canvas & workflow components
│   ├── nodes/             # Node type components
│   └── layouts/           # Layout components
│
├── lib/                    # Shared utilities
│   ├── db/                # Database & schema
│   ├── auth/              # Authentication
│   ├── redis/             # Redis client
│   ├── temporal/          # Workflow definitions
│   └── pandastack/         # PandaStack client
│
├── specific.hcl           # Infrastructure as code
└── plan.md                # Full architecture documentation
```

## Next Steps

### Phase 2: Node System (Weeks 2-3)

**Immediate priorities:**

1. **Implement Core Node Types**
   - Trigger nodes (manual, schedule, webhook)
   - Transform nodes (filter, map, aggregate)
   - Control flow nodes (if/else, loop, parallel)

2. **PandaStack Integration**
   - Build PandaStack API client
   - Create code execution node
   - Add web scraping capabilities

3. **AI Integration**
   - LLM processing nodes (OpenAI/Anthropic)
   - Vector search/RAG capabilities
   - HTTP request & integration nodes

### Testing the Current Build

1. **Visit the landing page** at `http://localhost:3000`
   - See the hero section with feature cards
   - Navigate using the sidebar

2. **Create a workflow**
   - Click "Create Workflow"
   - See the React Flow canvas
   - Try dragging nodes (basic functionality)

3. **Explore the structure**
   - Check out `/workflows` for the list view
   - Review the database schema in `lib/db/schema.ts`
   - See the Specific config in `specific.hcl`

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
TEMPORAL_ADDRESS=localhost:7233

# Optional (for features)
NEXTAUTH_SECRET=your-secret
PANDASTACK_API_KEY=your-key
OPENAI_API_KEY=your-key
```

### Specific Infrastructure

The `specific.hcl` file defines:
- **Services**: frontend, temporal-worker
- **Databases**: PostgreSQL 16, Redis 7
- **Workflows**: Temporal 1.22
- **Storage**: S3-compatible artifacts storage
- **Secrets**: API keys and encryption keys

## Architecture Highlights

### Multi-Tenant from Day 1
- Organization-based isolation
- Role-based access control (RBAC)
- Team invitation system
- Quota management

### Performance Built-In
- Sub-300ms execution with PandaStack microVMs
- Redis caching layer
- Virtual rendering for large workflows
- Optimistic UI updates

### Enterprise Security
- Hardware-level isolation (Firecracker)
- Encrypted credentials storage
- Audit logging
- SOC2 compliance ready

## Troubleshooting

### Database Connection Error
```bash
# Check if PostgreSQL is running
specific status

# Or manually check
psql $DATABASE_URL
```

### Redis Connection Error
```bash
# Check Redis status
redis-cli ping
```

### Port Already in Use
```bash
# Change port in package.json dev script
"dev": "next dev -p 3001 --turbopack"
```

## Resources

- **Full Architecture**: See [plan.md](./plan.md)
- **Database Schema**: See [lib/db/schema.ts](./lib/db/schema.ts)
- **Specific Docs**: Run `specific docs`
- **React Flow Docs**: https://reactflow.dev
- **PandaStack**: https://pandastack.ai

## Support

For questions or issues:
1. Check [plan.md](./plan.md) for detailed architecture
2. Review this quickstart guide
3. Open an issue on GitHub

---