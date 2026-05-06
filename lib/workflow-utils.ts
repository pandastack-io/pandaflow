import { z } from 'zod';

export const TAG_COLOR_CLASSES = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-red-100 text-red-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
] as const;

export const workflowDefinitionSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
}).passthrough();

export const workflowImportSchema = z.object({
  version: z.string().optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  definition: workflowDefinitionSchema,
  exportedAt: z.string().optional(),
}).passthrough();

export const workflowCreateSchema = z.object({
  name: z.string().trim().min(1, 'Workflow name is required'),
  description: z.string().optional().nullable(),
  definition: workflowDefinitionSchema,
  workflowType: z.enum(['automation', 'chat', 'agent']).optional(),
  chatSettings: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
});

export function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

export function parseImportedWorkflowJson(raw: string) {
  const parsed = workflowImportSchema.parse(JSON.parse(raw));

  return {
    version: parsed.version ?? '1.0',
    name: parsed.name ?? 'Imported Workflow',
    description: parsed.description ?? '',
    tags: sanitizeTags(parsed.tags),
    definition: parsed.definition,
    exportedAt: parsed.exportedAt,
  };
}

export function getTagColorClasses(tag: string) {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash << 5) - hash + tag.charCodeAt(index);
    hash |= 0;
  }

  return TAG_COLOR_CLASSES[Math.abs(hash) % TAG_COLOR_CLASSES.length];
}

export function getWorkflowExportFilename(name: string) {
  const baseName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workflow';

  return `${baseName}.workflow.json`;
}
