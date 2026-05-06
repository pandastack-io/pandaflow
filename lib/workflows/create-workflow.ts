import { resolveChatSettings, type WorkflowType } from '@/lib/chat';
import { db } from '@/lib/db';
import { workflows } from '@/lib/db/schema';
import { sanitizeTags } from '@/lib/workflow-utils';

export interface CreateWorkflowInput {
  name: string;
  description?: string | null;
  definition: unknown;
  workflowType?: WorkflowType;
  chatSettings?: unknown;
  tags?: string[];
}

export async function createWorkflowRecord({
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
      organizationId: '00000000-0000-0000-0000-000000000000',
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
