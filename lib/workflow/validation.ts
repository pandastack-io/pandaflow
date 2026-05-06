import type { Edge, Node } from 'reactflow';
import { getNodeByType } from '@/lib/nodes/registry';
import { validateNodeConfig } from '@/lib/nodes/validation';
import { NodeCategory, type WorkflowNodeData } from '@/types/nodes';

export interface ValidationIssue {
  nodeId?: string;
  nodeName?: string;
  severity: 'error' | 'warning';
  message: string;
}

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

function getValueByPath(value: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, value);
}

function getRequiredSchemaFields(schema: { safeParse?: (value: unknown) => unknown } | undefined) {
  const result = schema?.safeParse?.({}) as
    | {
        success: true;
      }
    | {
        success: false;
        error: {
          issues: Array<{
            code: string;
            path: Array<string | number>;
            input?: unknown;
            received?: string;
          }>;
        };
      }
    | undefined;

  if (!result || result.success) {
    return [];
  }

  const fields = new Set<string>();

  for (const issue of result.error.issues) {
    const fieldPath = issue.path.join('.');
    const isMissingValue =
      issue.code === 'invalid_type' && (issue.received === 'undefined' || typeof issue.input === 'undefined');

    if (fieldPath && isMissingValue) {
      fields.add(fieldPath);
    }
  }

  return [...fields];
}

function getNodeName(node: Node<WorkflowNodeData>) {
  return node.data.config?.label?.trim() || getNodeByType(node.data.type)?.name || node.id;
}

function isTriggerNode(node: Node<WorkflowNodeData>) {
  const nodeInfo = getNodeByType(node.data.type);
  return nodeInfo?.category === NodeCategory.TRIGGER || node.data.type.startsWith('trigger.');
}

function isOutputNode(node: Node<WorkflowNodeData>) {
  const nodeInfo = getNodeByType(node.data.type);
  return nodeInfo?.category === NodeCategory.OUTPUT || node.data.type.startsWith('output.');
}

export function validateWorkflow(nodes: Node<WorkflowNodeData>[], edges: Edge[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const connectedNodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const triggerNodes = nodes.filter(isTriggerNode);

  if (triggerNodes.length === 0) {
    issues.push({
      severity: 'error',
      message: 'Workflow must have at least one trigger node',
    });
  }

  for (const node of nodes) {
    const nodeName = getNodeName(node);

    if (!connectedNodeIds.has(node.id)) {
      issues.push({
        nodeId: node.id,
        nodeName,
        severity: 'warning',
        message: `Node '${nodeName}' is not connected`,
      });
    }

    const nodeInfo = getNodeByType(node.data.type);
    if (!nodeInfo) {
      continue;
    }

    const missingFields = new Set<string>();
    const config = (node.data.config ?? {}) as Record<string, unknown>;

    for (const fieldPath of getRequiredSchemaFields(nodeInfo.configSchema)) {
      if (isEmptyValue(getValueByPath(config, fieldPath))) {
        missingFields.add(humanizeFieldName(fieldPath));
      }
    }

    const nodeValidation = validateNodeConfig(node.data);
    for (const field of nodeValidation.missingFields) {
      missingFields.add(field);
    }

    if (missingFields.size > 0) {
      issues.push({
        nodeId: node.id,
        nodeName,
        severity: 'error',
        message: `Node '${nodeName}' is missing required fields: ${[...missingFields].join(', ')}`,
      });
    }
  }

  if (triggerNodes.length > 0) {
    const adjacency = new Map<string, string[]>();

    for (const edge of edges) {
      const targets = adjacency.get(edge.source) ?? [];
      targets.push(edge.target);
      adjacency.set(edge.source, targets);
    }

    const queue = triggerNodes.map((node) => node.id);
    const visited = new Set(queue);

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId) {
        continue;
      }

      for (const target of adjacency.get(nodeId) ?? []) {
        if (!visited.has(target)) {
          visited.add(target);
          queue.push(target);
        }
      }
    }

    const hasPathToOutput = nodes.filter(isOutputNode).some((node) => visited.has(node.id));

    if (!hasPathToOutput) {
      issues.push({
        severity: 'error',
        message: 'Workflow has no path from trigger to output',
      });
    }
  }

  return issues;
}
