CREATE TYPE "public"."workflow_type" AS ENUM('automation', 'chat', 'agent');--> statement-breakpoint
ALTER TYPE "public"."trigger_type" ADD VALUE 'chat';--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"session_id" varchar(128) NOT NULL,
	"title" varchar(255),
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"last_message_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "memory_store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"session_key" varchar(255) NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "vector_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"collection_name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"embedding_json" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "workflow_type" "workflow_type" DEFAULT 'automation' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "chat_public_id" varchar(64);--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "chat_settings" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_store" ADD CONSTRAINT "memory_store_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vector_documents" ADD CONSTRAINT "vector_documents_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_workflow" ON "chat_sessions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_session" ON "chat_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_sessions_workflow_session" ON "chat_sessions" USING btree ("workflow_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_memory_store_wf_session" ON "memory_store" USING btree ("workflow_id","session_key");--> statement-breakpoint
CREATE INDEX "idx_vector_docs_wf_collection" ON "vector_documents" USING btree ("workflow_id","collection_name");--> statement-breakpoint
CREATE INDEX "idx_workflows_chat_public_id" ON "workflows" USING btree ("chat_public_id");--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_chat_public_id_unique" UNIQUE("chat_public_id");