CREATE TYPE "public"."step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped', 'retrying');--> statement-breakpoint
CREATE TABLE "execution_dlq" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"agent_id" uuid,
	"failed_node_id" varchar(255),
	"failed_node_name" varchar(255),
	"error" text NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"original_input" jsonb,
	"trace_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"retry_execution_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "execution_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" varchar(255) NOT NULL,
	"node_name" varchar(255),
	"node_type" varchar(100),
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"retry_after" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "execution_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"parent_execution_id" uuid,
	"caller_node_id" varchar(255),
	"agent_id" uuid,
	"agent_name" varchar(255),
	"workflow_id" uuid NOT NULL,
	"workflow_name" varchar(255),
	"call_depth" integer DEFAULT 0 NOT NULL,
	"status" "execution_status" NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"cost_usd" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DATA TYPE timestamp with time zone USING CASE WHEN "email_verified" THEN now() ELSE NULL END;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "parent_execution_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "trace_id" uuid;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "call_depth" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "caller_node_id" varchar(255);--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "is_durable" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "retry_of" uuid;--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD CONSTRAINT "execution_dlq_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD CONSTRAINT "execution_dlq_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD CONSTRAINT "execution_dlq_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD CONSTRAINT "execution_dlq_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD CONSTRAINT "execution_dlq_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_traces" ADD CONSTRAINT "execution_traces_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_traces" ADD CONSTRAINT "execution_traces_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_traces" ADD CONSTRAINT "execution_traces_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dlq_org" ON "execution_dlq" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_dlq_execution" ON "execution_dlq" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_dlq_resolved" ON "execution_dlq" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "idx_execution_steps_execution" ON "execution_steps" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_execution_steps_attempt" ON "execution_steps" USING btree ("execution_id","node_id","attempt");--> statement-breakpoint
CREATE INDEX "idx_execution_traces_trace" ON "execution_traces" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_execution_traces_execution" ON "execution_traces" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_execution_traces_parent" ON "execution_traces" USING btree ("parent_execution_id");--> statement-breakpoint
CREATE INDEX "idx_executions_trace" ON "executions" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "idx_executions_parent" ON "executions" USING btree ("parent_execution_id");