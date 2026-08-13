DROP INDEX "idx_executions_temporal";--> statement-breakpoint
ALTER TABLE "executions" DROP COLUMN "temporal_workflow_id";--> statement-breakpoint
ALTER TABLE "executions" DROP COLUMN "temporal_run_id";