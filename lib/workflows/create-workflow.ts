import { resolveChatSettings, type WorkflowType } from '@/lib/chat';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { sanitizeTags } from '@/lib/workflow-utils';

export interface CreateWorkflowInput {
  organizationId: string;
  name: string;
  description?: string | null;
  definition: unknown;
  workflowType?: WorkflowType;
  chatSettings?: unknown;
  tags?: string[];
}

export async function createWorkflowRecord({
  organizationId,
  name,
  description,
  definition,
  workflowType,
  chatSettings,
  tags,
}: CreateWorkflowInput) {
  const selectedType: WorkflowType = workflowType ?? 'automation';

  const [newWorkflow] = await db
    .insert(workflows)
    .values({
      organizationId,
      name,
      description: description || '',
      definition,
      workflowType: selectedType,
      chatSettings: selectedType === 'chat' ? resolveChatSettings(chatSettings, name) : {},
      tags: sanitizeTags(tags),
      status: 'draft',
      version: '1.0.0',
    })
    .returning();

  return newWorkflow;
}
