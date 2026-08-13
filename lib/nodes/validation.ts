import { nodeRegistry } from '@/lib/nodes/registry';
import { NodeType, type WorkflowNodeData } from '@/types/nodes';

export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  errors: string[];
}

type ValidationRule =
  | {
      field: string;
      label?: string;
      when?: (config: Record<string, unknown>) => boolean;
    }
  | {
      anyOf: string[];
      label: string;
      when?: (config: Record<string, unknown>) => boolean;
    };

const ignoredEmptyDefaultKeys = new Set(['label', 'description']);

const requiredFieldRules: Partial<Record<NodeType, ValidationRule[]>> = {
  [NodeType.PANDASTACK_EXECUTE]: [{ field: 'code', label: 'Code' }],
  [NodeType.PANDASTACK_SCRAPE]: [{ field: 'url', label: 'URL' }],
  [NodeType.RAG_PDF_LOADER]: [
    { field: 'url', label: 'URL', when: (config) => (config.source ?? 'url') === 'url' },
    { field: 'variableName', label: 'Variable Name', when: (config) => config.source === 'variable' },
  ],
  [NodeType.RAG_WEB_LOADER]: [{ field: 'url', label: 'URL' }],
  [NodeType.AI_LLM]: [{ field: 'prompt', label: 'Prompt' }],
  [NodeType.AI_CHAT]: [{ field: 'prompt', label: 'Prompt' }],
  [NodeType.AI_COMPLETION]: [{ field: 'prompt', label: 'Prompt' }],
  [NodeType.AI_EMBEDDING]: [{ anyOf: ['text', 'inputVariable'], label: 'Text or Input Variable' }],
  [NodeType.AI_VECTOR_SEARCH]: [
    { field: 'endpoint', label: 'Endpoint / Base URL' },
    { field: 'collection', label: 'Collection / Class' },
    { anyOf: ['query', 'queryVector'], label: 'Query Text or Query Vector' },
  ],
  [NodeType.AI_CLASSIFICATION]: [
    { field: 'text', label: 'Text' },
    { field: 'labels', label: 'Labels' },
  ],
  [NodeType.AI_SENTIMENT]: [{ field: 'text', label: 'Text' }],
  [NodeType.AI_SUMMARIZATION]: [{ field: 'text', label: 'Text' }],
  [NodeType.AI_TRANSLATION]: [
    { field: 'text', label: 'Text' },
    { field: 'targetLanguage', label: 'Target Language' },
  ],
  [NodeType.AI_IMAGE_GEN]: [{ field: 'prompt', label: 'Prompt' }],
  [NodeType.AI_IMAGE_ANALYZE]: [
    { anyOf: ['imageUrl', 'imageBase64'], label: 'Image URL or Image Base64' },
    { field: 'prompt', label: 'Prompt' },
  ],
  [NodeType.AI_SPEECH_TO_TEXT]: [{ anyOf: ['audioUrl', 'audioBase64'], label: 'Audio URL or Audio Base64' }],
  [NodeType.AI_TEXT_TO_SPEECH]: [{ field: 'text', label: 'Text' }],
  [NodeType.AI_OCR]: [{ anyOf: ['imageUrl', 'imageBase64'], label: 'Image URL or Image Base64' }],
  [NodeType.AI_MODERATION]: [{ anyOf: ['text', 'inputVariable'], label: 'Text or Input Variable' }],
  [NodeType.CONTROL_CONDITION]: [
    { field: 'condition', label: 'Condition', when: (config) => (config.evaluationType ?? 'expression') === 'expression' },
    { field: 'expression', label: 'Expression', when: (config) => config.evaluationType === 'javascript' },
  ],
  [NodeType.CONTROL_SWITCH]: [{ field: 'expression', label: 'Expression' }],
  [NodeType.CONTROL_SUB_WORKFLOW]: [{ field: 'workflowId', label: 'Workflow ID' }],
  [NodeType.UTILITY_VARIABLE]: [
    { field: 'name', label: 'Variable Name' },
    { field: 'value', label: 'Value' },
  ],
  [NodeType.UTILITY_GET_VARIABLE]: [{ field: 'name', label: 'Variable Name' }],
};

function isEmptyValue(value: unknown) {
  return value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
}

function humanizeFieldName(fieldPath: string) {
  return fieldPath
    .split('.')
    .map((part) =>
      part
        .replace(/([A-Z])/g, ' $1')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, (char) => char.toUpperCase())
        .trim()
    )
    .join(' → ')
    .replace(/\bApi\b/g, 'API')
    .replace(/\bUrl\b/g, 'URL')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bJson\b/g, 'JSON')
    .replace(/\bPdf\b/g, 'PDF')
    .replace(/\bHtml\b/g, 'HTML')
    .replace(/\bOcr\b/g, 'OCR')
    .replace(/\bSql\b/g, 'SQL')
    .replace(/\bUuid\b/g, 'UUID');
}

function addUnique(target: string[], seen: Set<string>, value: string) {
  if (seen.has(value)) return;
  seen.add(value);
  target.push(value);
}

export function validateNodeConfig(data: WorkflowNodeData): ValidationResult {
  const nodeInfo = nodeRegistry[data.type];
  if (!nodeInfo) {
    return { isValid: true, missingFields: [], errors: [] };
  }

  const config = (data.config ?? {}) as Record<string, unknown>;
  const missingFields: string[] = [];
  const errors: string[] = [];
  const missingSeen = new Set<string>();
  const errorSeen = new Set<string>();

  const result = nodeInfo.configSchema?.safeParse?.(config);
  if (result && !result.success) {
    for (const issue of result.error.issues) {
      const fieldPath = issue.path.join('.');
      const fieldLabel = humanizeFieldName(fieldPath || 'Configuration');
      const isUndefinedTypeIssue = issue.code === 'invalid_type' && 'received' in issue && issue.received === 'undefined';
      const isEmptyStringIssue = issue.code === 'too_small' && 'minimum' in issue && issue.minimum === 1;

      if (isUndefinedTypeIssue || isEmptyStringIssue) {
        addUnique(missingFields, missingSeen, fieldLabel);
      } else {
        addUnique(errors, errorSeen, `${fieldLabel}: ${issue.message}`);
      }
    }
  }

  for (const [field, defaultValue] of Object.entries(nodeInfo.defaultConfig ?? {})) {
    if (ignoredEmptyDefaultKeys.has(field) || defaultValue !== '') {
      continue;
    }

    if (isEmptyValue(config[field])) {
      addUnique(missingFields, missingSeen, humanizeFieldName(field));
    }
  }

  for (const rule of requiredFieldRules[data.type] ?? []) {
    if (rule.when && !rule.when(config)) {
      continue;
    }

    if ('field' in rule) {
      if (isEmptyValue(config[rule.field])) {
        addUnique(missingFields, missingSeen, rule.label ?? humanizeFieldName(rule.field));
      }
      continue;
    }

    if (rule.anyOf.every((field) => isEmptyValue(config[field]))) {
      addUnique(missingFields, missingSeen, rule.label);
    }
  }

  return {
    isValid: missingFields.length === 0 && errors.length === 0,
    missingFields,
    errors,
  };
}
