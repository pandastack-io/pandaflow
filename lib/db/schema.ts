import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, integer, decimal, index, uniqueIndex, pgEnum, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'member', 'viewer']);
export const workflowStatusEnum = pgEnum('workflow_status', ['draft', 'active', 'paused', 'archived']);
export const workflowTypeEnum = pgEnum('workflow_type', ['automation', 'chat', 'agent']);
export const executionStatusEnum = pgEnum('execution_status', ['pending', 'running', 'completed', 'failed', 'cancelled']);
export const agentStatusEnum = pgEnum('agent_status', ['deployed', 'running', 'stopped', 'paused', 'error', 'crashed']);
export const triggerTypeEnum = pgEnum('trigger_type', ['manual', 'schedule', 'webhook', 'event', 'chat']);
export const logLevelEnum = pgEnum('log_level', ['debug', 'info', 'warn', 'error']);

// Organizations
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  settings: jsonb('settings').default({}),
  billingTier: varchar('billing_tier', { length: 50 }).default('free'),
  usageQuota: jsonb('usage_quota').default({}),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex('idx_orgs_slug').on(table.slug),
}));

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  preferences: jsonb('preferences').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  emailIdx: index('idx_users_email').on(table.email),
}));

// NextAuth.js Tables (DrizzleAdapter)
export const accounts = pgTable('accounts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 255 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: varchar('token_type', { length: 255 }),
  scope: varchar('scope', { length: 255 }),
  id_token: text('id_token'),
  session_state: varchar('session_state', { length: 255 }),
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}));

export const sessions = pgTable('sessions', {
  sessionToken: varchar('session_token', { length: 255 }).notNull().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
  identifier: varchar('identifier', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).notNull(),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}));

// Organization Members
export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: userRoleEnum('role').notNull(),
  permissions: jsonb('permissions').default([]),
  invitedBy: uuid('invited_by').references(() => users.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgUserIdx: uniqueIndex('idx_org_members_org_user').on(table.organizationId, table.userId),
  orgIdx: index('idx_org_members_org').on(table.organizationId),
  userIdx: index('idx_org_members_user').on(table.userId),
}));

// Workflows
export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  definition: jsonb('definition').notNull(),
  workflowType: workflowTypeEnum('workflow_type').default('automation').notNull(),
  tags: text('tags').array().default([]),
  category: varchar('category', { length: 100 }),
  isTemplate: boolean('is_template').default(false),
  isPublic: boolean('is_public').default(false),
  chatPublicId: varchar('chat_public_id', { length: 64 }).unique(), // public slug for /chat/[id]
  chatSettings: jsonb('chat_settings').default({}),                  // title, welcome msg, theme, etc.
  version: varchar('version', { length: 50 }).default('1.0.0'),
  parentVersionId: uuid('parent_version_id'),
  status: workflowStatusEnum('status').default('draft'),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (table) => ({
  orgIdx: index('idx_workflows_org').on(table.organizationId),
  createdByIdx: index('idx_workflows_created_by').on(table.createdBy),
  statusIdx: index('idx_workflows_status').on(table.status),
  tagsIdx: index('idx_workflows_tags').on(table.tags),
  chatPublicIdIdx: index('idx_workflows_chat_public_id').on(table.chatPublicId),
}));

// Workflow Versions
export const workflowVersions = pgTable('workflow_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  version: varchar('version', { length: 50 }).notNull(),
  definition: jsonb('definition').notNull(),
  changelog: text('changelog'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workflowVersionIdx: uniqueIndex('idx_workflow_versions_workflow_version').on(table.workflowId, table.version),
  workflowIdx: index('idx_workflow_versions_workflow').on(table.workflowId),
}));

// Executions
export const executions = pgTable('executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  workflowVersionId: uuid('workflow_version_id').references(() => workflowVersions.id),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  triggerType: triggerTypeEnum('trigger_type').notNull(),
  triggeredBy: uuid('triggered_by').references(() => users.id),
  status: executionStatusEnum('status').notNull(),
  input: jsonb('input'),
  output: jsonb('output'),
  error: jsonb('error'),
  temporalWorkflowId: varchar('temporal_workflow_id', { length: 255 }),
  temporalRunId: varchar('temporal_run_id', { length: 255 }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  nodeCount: integer('node_count'),
  nodesCompleted: integer('nodes_completed'),
  costUsd: decimal('cost_usd', { precision: 10, scale: 4 }),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workflowIdx: index('idx_executions_workflow').on(table.workflowId),
  agentIdx: index('idx_executions_agent').on(table.agentId),
  orgIdx: index('idx_executions_org').on(table.organizationId),
  statusIdx: index('idx_executions_status').on(table.status),
  createdAtIdx: index('idx_executions_created_at').on(table.createdAt),
  temporalIdx: index('idx_executions_temporal').on(table.temporalWorkflowId),
}));

// Execution Logs
export const executionLogs = pgTable('execution_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  executionId: uuid('execution_id').references(() => executions.id, { onDelete: 'cascade' }).notNull(),
  nodeId: varchar('node_id', { length: 255 }),
  nodeName: varchar('node_name', { length: 255 }),
  level: logLevelEnum('level').notNull(),
  message: text('message').notNull(),
  data: jsonb('data'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
  durationMs: integer('duration_ms'),
}, (table) => ({
  executionIdx: index('idx_execution_logs_execution').on(table.executionId),
  timestampIdx: index('idx_execution_logs_timestamp').on(table.timestamp),
}));

// Node Registry
export const nodeRegistry = pgTable('node_registry', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  nodeType: varchar('node_type', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  icon: varchar('icon', { length: 100 }),
  configSchema: jsonb('config_schema').notNull(),
  defaultConfig: jsonb('default_config').default({}),
  handlerType: varchar('handler_type', { length: 50 }).notNull(),
  handlerConfig: jsonb('handler_config').default({}),
  isPublic: boolean('is_public').default(false),
  isBuiltin: boolean('is_builtin').default(false),
  version: varchar('version', { length: 50 }).default('1.0.0'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_node_registry_org').on(table.organizationId),
  typeIdx: index('idx_node_registry_type').on(table.nodeType),
}));

// Credentials
export const credentials = pgTable('credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  encryptedData: text('encrypted_data').notNull(),
  encryptionKeyId: varchar('encryption_key_id', { length: 255 }).notNull(),
  description: text('description'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_credentials_org').on(table.organizationId),
}));

// Webhooks
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  urlPath: varchar('url_path', { length: 255 }).notNull().unique(),
  httpMethod: varchar('http_method', { length: 10 }).default('POST'),
  authType: varchar('auth_type', { length: 50 }),
  authConfig: jsonb('auth_config').default({}),
  requestSchema: jsonb('request_schema'),
  isActive: boolean('is_active').default(true),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workflowIdx: index('idx_webhooks_workflow').on(table.workflowId),
  pathIdx: index('idx_webhooks_path').on(table.urlPath),
}));

// Webhook Logs
export const webhookLogs = pgTable('webhook_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  webhookId: uuid('webhook_id').references(() => webhooks.id, { onDelete: 'cascade' }).notNull(),
  method: varchar('method', { length: 10 }),
  headers: jsonb('headers'),
  body: jsonb('body'),
  queryParams: jsonb('query_params'),
  statusCode: integer('status_code'),
  response: jsonb('response'),
  executionId: uuid('execution_id').references(() => executions.id),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow(),
  durationMs: integer('duration_ms'),
}, (table) => ({
  webhookIdx: index('idx_webhook_logs_webhook').on(table.webhookId),
  receivedAtIdx: index('idx_webhook_logs_received_at').on(table.receivedAt),
}));

export const workflowSchedules = pgTable('workflow_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  organizationId: uuid('organization_id').notNull(),
  cronExpression: varchar('cron_expression', { length: 100 }).notNull(),
  timezone: varchar('timezone', { length: 100 }).default('UTC'),
  isActive: boolean('is_active').default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workflowIdx: index('idx_schedules_workflow').on(table.workflowId),
  nextRunIdx: index('idx_schedules_next_run').on(table.nextRunAt),
}));

// Audit Logs
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }),
  resourceId: uuid('resource_id'),
  metadata: jsonb('metadata').default({}),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_audit_logs_org').on(table.organizationId),
  userIdx: index('idx_audit_logs_user').on(table.userId),
  createdAtIdx: index('idx_audit_logs_created_at').on(table.createdAt),
}));

// Usage Metrics
export const usageMetrics = pgTable('usage_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  date: timestamp('date', { withTimezone: false, mode: 'date' }).notNull(),
  executionsCount: integer('executions_count').default(0),
  executionDurationMs: integer('execution_duration_ms').default(0),
  sandflareCall: integer('sandflare_calls').default(0),
  aiTokensUsed: integer('ai_tokens_used').default(0),
  costUsd: decimal('cost_usd', { precision: 10, scale: 4 }).default('0'),
  metadata: jsonb('metadata').default({}),
}, (table) => ({
  orgDateIdx: uniqueIndex('idx_usage_metrics_org_date').on(table.organizationId, table.date),
  orgIdx: index('idx_usage_metrics_org').on(table.organizationId),
  dateIdx: index('idx_usage_metrics_date').on(table.date),
}));

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  workflows: many(workflows),
  executions: many(executions),
  credentials: many(credentials),
  webhooks: many(webhooks),
  workflowSchedules: many(workflowSchedules),
  auditLogs: many(auditLogs),
  usageMetrics: many(usageMetrics),
}));

export const usersRelations = relations(users, ({ many }) => ({
  organizationMemberships: many(organizationMembers),
  createdWorkflows: many(workflows, { relationName: 'createdBy' }),
  triggeredExecutions: many(executions),
  auditLogs: many(auditLogs),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [workflows.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [workflows.createdBy],
    references: [users.id],
    relationName: 'createdBy',
  }),
  versions: many(workflowVersions),
  executions: many(executions),
  webhooks: many(webhooks),
  schedules: many(workflowSchedules),
}));

export const executionsRelations = relations(executions, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [executions.workflowId],
    references: [workflows.id],
  }),
  workflowVersion: one(workflowVersions, {
    fields: [executions.workflowVersionId],
    references: [workflowVersions.id],
  }),
  organization: one(organizations, {
    fields: [executions.organizationId],
    references: [organizations.id],
  }),
  triggeredByUser: one(users, {
    fields: [executions.triggeredBy],
    references: [users.id],
  }),
  logs: many(executionLogs),
}));

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [webhooks.workflowId],
    references: [workflows.id],
  }),
  organization: one(organizations, {
    fields: [webhooks.organizationId],
    references: [organizations.id],
  }),
  logs: many(webhookLogs),
}));

export const webhookLogsRelations = relations(webhookLogs, ({ one }) => ({
  webhook: one(webhooks, {
    fields: [webhookLogs.webhookId],
    references: [webhooks.id],
  }),
  execution: one(executions, {
    fields: [webhookLogs.executionId],
    references: [executions.id],
  }),
}));

export const workflowSchedulesRelations = relations(workflowSchedules, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowSchedules.workflowId],
    references: [workflows.id],
  }),
  organization: one(organizations, {
    fields: [workflowSchedules.organizationId],
    references: [organizations.id],
  }),
}));

// Chat Sessions — for chat-type workflows deployed as chat interfaces
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  sessionId: varchar('session_id', { length: 128 }).notNull(), // client-generated UUID
  title: varchar('title', { length: 255 }),                    // auto-generated from first message
  messages: jsonb('messages').default([]).notNull(),            // { role, content, timestamp, metadata? }[]
  metadata: jsonb('metadata').default({}),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workflowIdx: index('idx_chat_sessions_workflow').on(table.workflowId),
  sessionIdx: index('idx_chat_sessions_session').on(table.sessionId),
  workflowSessionIdx: uniqueIndex('idx_chat_sessions_workflow_session').on(table.workflowId, table.sessionId),
}));

// Memory Store — persistent conversation memory for memory nodes
export const memoryStore = pgTable('memory_store', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  sessionKey: varchar('session_key', { length: 255 }).notNull(),
  messages: jsonb('messages').default([]).notNull(),
  summary: text('summary'),                                    // for memory.summary nodes
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workflowSessionIdx: uniqueIndex('idx_memory_store_wf_session').on(table.workflowId, table.sessionKey),
}));

// Vector Documents — for RAG vector store (pgvector backend)
export const vectorDocuments = pgTable('vector_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  collectionName: varchar('collection_name', { length: 255 }).notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').default({}),
  embeddingJson: text('embedding_json'),                        // JSON array of floats until pgvector is available
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  workflowCollectionIdx: index('idx_vector_docs_wf_collection').on(table.workflowId, table.collectionName),
}));

// API Keys — for programmatic access to the platform
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().default('00000000-0000-0000-0000-000000000000'),
  name: varchar('name', { length: 255 }).notNull(),
  keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
  keyHash: text('key_hash').notNull(),
  scopes: text('scopes').array().default([]),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_api_keys_org').on(table.organizationId),
  prefixIdx: uniqueIndex('idx_api_keys_prefix').on(table.keyPrefix),
}));

// Agent Registry — each deployed workflow becomes a persistent agent
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: agentStatusEnum('status').default('stopped').notNull(),
  identityToken: varchar('identity_token', { length: 255 }).notNull().unique(),
  sandboxId: varchar('sandbox_id', { length: 255 }),
  memoryNamespace: varchar('memory_namespace', { length: 255 }).notNull(),
  config: jsonb('config').default({}),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  totalExecutions: integer('total_executions').default(0),
  totalCostUsd: decimal('total_cost_usd', { precision: 10, scale: 6 }).default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  orgIdx: index('idx_agents_org').on(table.organizationId),
  workflowIdx: index('idx_agents_workflow').on(table.workflowId),
  tokenIdx: uniqueIndex('idx_agents_token').on(table.identityToken),
}));

// Agent Message Bus — persistent log of inter-agent messages
export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  fromAgentId: uuid('from_agent_id').references(() => agents.id, { onDelete: 'set null' }),
  toAgentId: uuid('to_agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  topic: varchar('topic', { length: 255 }).notNull(),
  payload: jsonb('payload').default({}),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, (table) => ({
  topicIdx: index('idx_agent_messages_topic').on(table.topic),
  toAgentIdx: index('idx_agent_messages_to').on(table.toAgentId),
}));

// Agent Events — heartbeats, status changes, health history
export const agentEvents = pgTable('agent_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  data: jsonb('data').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  agentIdx: index('idx_agent_events_agent').on(table.agentId),
  typeIdx: index('idx_agent_events_type').on(table.type),
}));

// Execution Costs — per-node cost breakdown for cost intelligence
export const executionCosts = pgTable('execution_costs', {
  id: uuid('id').primaryKey().defaultRandom(),
  executionId: uuid('execution_id').references(() => executions.id, { onDelete: 'cascade' }).notNull(),
  nodeId: varchar('node_id', { length: 255 }).notNull(),
  nodeName: varchar('node_name', { length: 255 }),
  nodeType: varchar('node_type', { length: 255 }),
  tokensInput: integer('tokens_input').default(0),
  tokensOutput: integer('tokens_output').default(0),
  sandflareMs: integer('sandflare_ms').default(0),
  costUsd: decimal('cost_usd', { precision: 10, scale: 8 }).default('0'),
  model: varchar('model', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  executionIdx: index('idx_execution_costs_execution').on(table.executionId),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, { fields: [agents.organizationId], references: [organizations.id] }),
  workflow: one(workflows, { fields: [agents.workflowId], references: [workflows.id] }),
  messages: many(agentMessages),
  events: many(agentEvents),
}));

export const agentMessagesRelations = relations(agentMessages, ({ one }) => ({
  fromAgent: one(agents, { fields: [agentMessages.fromAgentId], references: [agents.id] }),
  toAgent: one(agents, { fields: [agentMessages.toAgentId], references: [agents.id] }),
}));

export const agentEventsRelations = relations(agentEvents, ({ one }) => ({
  agent: one(agents, { fields: [agentEvents.agentId], references: [agents.id] }),
}));

export const executionCostsRelations = relations(executionCosts, ({ one }) => ({
  execution: one(executions, { fields: [executionCosts.executionId], references: [executions.id] }),
}));
