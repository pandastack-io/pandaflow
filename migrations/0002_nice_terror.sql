CREATE TYPE "public"."agent_status" AS ENUM('deployed', 'running', 'stopped', 'paused', 'error', 'crashed');--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"from_agent_id" uuid,
	"to_agent_id" uuid,
	"topic" varchar(255) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" "agent_status" DEFAULT 'stopped' NOT NULL,
	"identity_token" varchar(255) NOT NULL,
	"sandbox_id" varchar(255),
	"memory_namespace" varchar(255) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"last_heartbeat_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"total_executions" integer DEFAULT 0,
	"total_cost_usd" numeric(10, 6) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agents_identity_token_unique" UNIQUE("identity_token")
);
--> statement-breakpoint
CREATE TABLE "execution_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" varchar(255) NOT NULL,
	"node_name" varchar(255),
	"node_type" varchar(255),
	"tokens_input" integer DEFAULT 0,
	"tokens_output" integer DEFAULT 0,
	"sandflare_ms" integer DEFAULT 0,
	"cost_usd" numeric(10, 8) DEFAULT '0',
	"model" varchar(100),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_costs" ADD CONSTRAINT "execution_costs_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_events_agent" ON "agent_events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_agent_events_type" ON "agent_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_topic" ON "agent_messages" USING btree ("topic");--> statement-breakpoint
CREATE INDEX "idx_agent_messages_to" ON "agent_messages" USING btree ("to_agent_id");--> statement-breakpoint
CREATE INDEX "idx_agents_org" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_agents_workflow" ON "agents" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agents_token" ON "agents" USING btree ("identity_token");--> statement-breakpoint
CREATE INDEX "idx_execution_costs_execution" ON "execution_costs" USING btree ("execution_id");