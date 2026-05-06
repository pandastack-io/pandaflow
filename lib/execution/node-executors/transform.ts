/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { JSONPath } from 'jsonpath-plus';
import jmespath from 'jmespath';
import { Node, Edge } from 'reactflow';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
import {
  interpolate,
  interpolateDeep,
  withRetry,
  resolveNodeInput,
  safeJsonParse,
} from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type WorkflowDefinition = { nodes: WorkflowNode[]; edges: Edge[] };
type GenericConfig = Record<string, any>;
type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: Array<XmlNode | string>;
};

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getResolvedInput(config: GenericConfig, context: ExecutorContext): any {
  const value = resolveNodeInput(context, config.inputVariable);
  if (value !== undefined) return value;
  return config.input;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeInput(value: any): any {
  if (typeof value !== 'string') return value;
  const parsed = safeJsonParse(value);
  return parsed === value ? value : parsed;
}

function normalizeArrayInput(value: any, nodeType: NodeType): any[] {
  const normalized = normalizeInput(value);
  if (normalized === undefined || normalized === null) return [];
  if (Array.isArray(normalized)) return normalized;
  if (typeof normalized === 'string' && normalized.trim() === '') return [];
  if (typeof normalized === 'object') return [normalized];
  if (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean') {
    return [normalized];
  }
  throw new Error(`${nodeType} expects array-compatible input.`);
}

function parseConfigValue<T = any>(value: any, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    return (parsed === value ? fallback : parsed) as T;
  }
  return value as T;
}

function resolvePath(source: any, path?: string): any {
  if (!path || path === '$' || path === '@' || path === 'input') return source;

  const normalized = path
    .replace(/^input\./, '')
    .replace(/^\$\./, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/^\./, '');

  if (!normalized) return source;

  return normalized.split('.').reduce((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[part as keyof typeof acc];
  }, source as any);
}

function compileExpression(expression: string, scope: Record<string, any>): any {
  const trimmed = expression.trim();
  const keys = Object.keys(scope);
  const values = Object.values(scope);

  try {
    return new Function(...keys, `'use strict'; return (${trimmed});`)(...values);
  } catch {
    const body = trimmed.includes('return') ? trimmed : `return (${trimmed});`;
    return new Function(...keys, `'use strict'; ${body}`)(...values);
  }
}

function executeExpression(expression: string, scope: Record<string, any>, args: any[] = []): any {
  const compiled = compileExpression(expression, scope);
  if (typeof compiled === 'function') return compiled(...args);
  return compiled;
}

function createScope(context: ExecutorContext, input: any, extra: Record<string, any> = {}): Record<string, any> {
  return {
    input,
    data: input,
    variables: context.variables,
    nodes: context.nodeOutputs,
    context,
    ...extra,
  };
}

function compareValues(actual: any, operator: string, expected: any): boolean {
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'contains':
      return Array.isArray(actual)
        ? actual.includes(expected)
        : String(actual ?? '').includes(String(expected ?? ''));
    case 'regex':
      return new RegExp(String(expected)).test(String(actual ?? ''));
    default:
      throw new Error(`Unsupported filter operator: ${operator}`);
  }
}

function deepMerge(target: any, source: any, arrayStrategy: 'concat' | 'replace' = 'concat'): any {
  if (Array.isArray(target) && Array.isArray(source)) {
    return arrayStrategy === 'replace' ? [...source] : [...target, ...source];
  }

  if (isRecord(target) && isRecord(source)) {
    const result: Record<string, any> = { ...target };
    Object.entries(source).forEach(([key, value]) => {
      if (key in result) {
        result[key] = deepMerge(result[key], value, arrayStrategy);
      } else {
        result[key] = value;
      }
    });
    return result;
  }

  return source;
}

function toComparableValue(value: any): string | number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return String(value ?? '').toLowerCase();
}

function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.length > 1 || row[0] !== '' || rows.length === 0) {
    rows.push(row);
  }

  return rows;
}

function stringifyCsv(rows: any[], delimiter = ',', includeHeaders = true): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';

  const csvRows: string[][] = [];
  if (isRecord(rows[0])) {
    const headers = Array.from(
      rows.reduce<Set<string>>((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set<string>())
    );

    if (includeHeaders) csvRows.push(headers);
    rows.forEach((row) => {
      csvRows.push(headers.map((header) => String(row[header] ?? '')));
    });
  } else {
    rows.forEach((row) => {
      csvRows.push(Array.isArray(row) ? row.map((value) => String(value ?? '')) : [String(row ?? '')]);
    });
  }

  return csvRows
    .map((csvRow) =>
      csvRow
        .map((value) => {
          if (/[",\r\n]/.test(value) || value.includes(delimiter)) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(delimiter)
    )
    .join('\r\n');
}

function parseYamlScalar(value: string): any {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseYaml(text: string): any {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));

  function parseBlock(start: number, indent: number): { value: any; next: number } {
    let container: any = null;
    let index = start;

    while (index < lines.length) {
      const rawLine = lines[index];
      const currentIndent = rawLine.match(/^\s*/)?.[0].length ?? 0;
      if (currentIndent < indent) break;
      if (currentIndent > indent) throw new Error(`Invalid YAML indentation at line ${index + 1}`);

      const line = rawLine.trim();
      if (line.startsWith('- ')) {
        if (container === null) container = [];
        if (!Array.isArray(container)) throw new Error('Invalid YAML structure.');

        const valuePart = line.slice(2).trim();
        if (!valuePart) {
          const nested = parseBlock(index + 1, indent + 2);
          container.push(nested.value);
          index = nested.next;
          continue;
        }

        if (/^[^:]+:\s*/.test(valuePart) && !valuePart.startsWith('"') && !valuePart.startsWith("'")) {
          const separatorIndex = valuePart.indexOf(':');
          const key = valuePart.slice(0, separatorIndex).trim();
          const rawValue = valuePart.slice(separatorIndex + 1).trim();
          const item: Record<string, any> = {};
          if (!rawValue) {
            const nested = parseBlock(index + 1, indent + 2);
            item[key] = nested.value;
            container.push(item);
            index = nested.next;
            continue;
          }
          item[key] = parseYamlScalar(rawValue);
          container.push(item);
          index += 1;
          continue;
        }

        container.push(parseYamlScalar(valuePart));
        index += 1;
        continue;
      }

      if (container === null) container = {};
      if (Array.isArray(container)) throw new Error('Invalid YAML structure.');

      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) throw new Error(`Invalid YAML entry at line ${index + 1}`);
      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();

      if (!rawValue) {
        const nested = parseBlock(index + 1, indent + 2);
        container[key] = nested.value;
        index = nested.next;
        continue;
      }

      container[key] = parseYamlScalar(rawValue);
      index += 1;
    }

    return { value: container ?? {}, next: index };
  }

  return parseBlock(0, 0).value;
}

function stringifyYaml(value: any, indent = 0): string {
  const pad = ' '.repeat(indent);

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (isRecord(item) || Array.isArray(item)) {
          return `${pad}-\n${stringifyYaml(item, indent + 2)}`;
        }
        return `${pad}- ${String(item ?? '')}`;
      })
      .join('\n');
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entry]) => {
        if (isRecord(entry) || Array.isArray(entry)) {
          return `${pad}${key}:\n${stringifyYaml(entry, indent + 2)}`;
        }
        return `${pad}${key}: ${String(entry ?? 'null')}`;
      })
      .join('\n');
  }

  return `${pad}${String(value ?? '')}`;
}

function parseXmlAttributes(segment: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex = /(\w[\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = attributeRegex.exec(segment))) {
    attributes[match[1]] = match[2] ?? match[3] ?? '';
  }
  return attributes;
}

function parseXml(text: string): XmlNode {
  const cleaned = text
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const tokens = cleaned.match(/<[^>]+>|[^<]+/g) ?? [];
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;

  tokens.forEach((token) => {
    if (!token.trim()) return;

    if (token.startsWith('</')) {
      stack.pop();
      return;
    }

    if (token.startsWith('<')) {
      const selfClosing = token.endsWith('/>');
      const content = token.slice(1, token.length - (selfClosing ? 2 : 1)).trim();
      const separatorIndex = content.search(/\s/);
      const name = separatorIndex === -1 ? content : content.slice(0, separatorIndex);
      const attributeText = separatorIndex === -1 ? '' : content.slice(separatorIndex + 1);
      const node: XmlNode = {
        name,
        attributes: parseXmlAttributes(attributeText),
        children: [],
      };

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else {
        root = node;
      }

      if (!selfClosing) stack.push(node);
      return;
    }

    const textNode = token.trim();
    if (textNode && stack.length > 0) {
      stack[stack.length - 1].children.push(textNode);
    }
  });

  if (!root) throw new Error('Invalid XML: no root element found.');
  return root;
}

function xmlToObject(node: XmlNode): any {
  const result: Record<string, any> = {};
  const textContent = node.children.filter((child): child is string => typeof child === 'string').join(' ').trim();
  const childNodes = node.children.filter((child): child is XmlNode => typeof child !== 'string');

  if (Object.keys(node.attributes).length > 0) {
    result.$attributes = node.attributes;
  }

  childNodes.forEach((child) => {
    const childValue = xmlToObject(child);
    if (result[child.name] === undefined) {
      result[child.name] = childValue;
    } else if (Array.isArray(result[child.name])) {
      result[child.name].push(childValue);
    } else {
      result[child.name] = [result[child.name], childValue];
    }
  });

  if (textContent) {
    if (Object.keys(result).length === 0) return textContent;
    result.$text = textContent;
  }

  return result;
}

function objectToXml(value: any, rootName = 'root'): string {
  const render = (name: string, current: any): string => {
    if (Array.isArray(current)) {
      return current.map((entry) => render(name, entry)).join('');
    }

    if (!isRecord(current)) {
      return `<${name}>${String(current ?? '')}</${name}>`;
    }

    const attributes = isRecord(current.$attributes) ? current.$attributes : {};
    const text = current.$text ? String(current.$text) : '';
    const attributeText = Object.entries(attributes)
      .map(([key, entry]) => `${key}="${String(entry).replace(/"/g, '&quot;')}"`)
      .join(' ');
    const children = Object.entries(current)
      .filter(([key]) => key !== '$attributes' && key !== '$text')
      .map(([key, entry]) => render(key, entry))
      .join('');
    const openTag = attributeText ? `<${name} ${attributeText}>` : `<${name}>`;
    return `${openTag}${text}${children}</${name}>`;
  };

  if (isRecord(value) && Object.keys(value).length === 1) {
    const [key, entry] = Object.entries(value)[0];
    return render(key, entry);
  }

  return render(rootName, value);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function matchesSelector(tagName: string, attributes: Record<string, string>, selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return true;

  const attrMatch = trimmed.match(/^([a-zA-Z0-9_-]+)?\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
  if (attrMatch) {
    const [, tag, attr, expected] = attrMatch;
    if (tag && tag.toLowerCase() !== tagName.toLowerCase()) return false;
    if (!(attr in attributes)) return false;
    return expected === undefined ? true : attributes[attr] === expected;
  }

  const basicMatch = trimmed.match(/^([a-zA-Z0-9_-]+)?(?:#([a-zA-Z0-9_-]+))?(?:\.([a-zA-Z0-9_-]+))?$/);
  if (!basicMatch) return false;

  const [, tag, id, className] = basicMatch;
  if (tag && tag.toLowerCase() !== tagName.toLowerCase()) return false;
  if (id && attributes.id !== id) return false;
  if (className) {
    const classes = (attributes.class ?? '').split(/\s+/).filter(Boolean);
    if (!classes.includes(className)) return false;
  }

  return true;
}

function findHtmlMatches(html: string, selector?: string): Array<Record<string, any>> {
  const regex = /<([a-zA-Z][\w:-]*)([^>]*)>([\s\S]*?)<\/\1>/g;
  const matches: Array<Record<string, any>> = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    const tagName = match[1];
    const attributeText = match[2] ?? '';
    const innerHtml = match[3] ?? '';
    const attributes = parseXmlAttributes(attributeText);

    if (!selector || matchesSelector(tagName, attributes, selector)) {
      matches.push({
        tagName,
        attributes,
        innerHtml,
        outerHtml: match[0],
        text: decodeHtmlEntities(innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
      });
    }
  }

  return matches;
}

async function safeLog(
  deps: ExecutorDeps,
  node: WorkflowNode,
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context: ExecutorContext,
  data?: any
) {
  try {
    await deps.logNodeExecution(node.id, node.data.config?.label || node.id, level, message, data, context);
  } catch {
    // Logging should never block execution.
  }
}

function createExecutor(name: string, handler: NodeExecutorFn): NodeExecutorFn {
  return async (node, definition, context, deps) => {
    const startedAt = Date.now();
    await safeLog(deps, node, 'debug', `Starting ${name} executor`, context);

    try {
      const result = await withRetry(() => handler(node, definition, context, deps), {
        maxAttempts: 1,
        retryOn: () => false,
      });

      await safeLog(deps, node, 'info', `${name} executor completed`, context, {
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await safeLog(deps, node, 'error', error instanceof Error ? error.message : `${name} executor failed`, context, {
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  };
}

const transformDataExecutor = createExecutor('Transform Data', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeInput(getResolvedInput(config, context));
  const transformType = String(config.transformType ?? config.operation ?? 'javascript');
  const transformation = interpolate(String(config.transformation ?? config.expression ?? 'input'), context);
  const inputMapping = isRecord(config.inputMapping) ? config.inputMapping : {};
  const mappedInputs = Object.fromEntries(
    Object.entries(inputMapping).map(([key, path]) => [key, resolvePath(input, String(path))])
  );

  const scope = createScope(context, input, { mappedInputs });
  let output: any;

  switch (transformType) {
    case 'jsonpath':
      output = JSONPath({ path: transformation, json: input, wrap: false });
      break;
    case 'jmespath':
      output = jmespath.search(input, transformation);
      break;
    default:
      output = executeExpression(transformation, scope, [input, context.variables, context.nodeOutputs]);
      break;
  }

  if (isRecord(config.outputMapping) && output !== undefined) {
    output = Object.fromEntries(
      Object.entries(config.outputMapping).map(([key, path]) => [key, resolvePath(output, String(path))])
    );
  }

  return {
    output,
    metadata: {
      transformType,
      mappedInputs,
    },
  };
});

const transformFilterExecutor = createExecutor('Transform Filter', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeArrayInput(getResolvedInput(config, context), NodeType.TRANSFORM_FILTER);
  const logic = String(config.logic ?? 'AND').toUpperCase();
  const expression = config.expression ? interpolate(String(config.expression), context) : undefined;

  const output = input.filter((item, index, array) => {
    if (expression) {
      return Boolean(
        executeExpression(expression, createScope(context, input, { item, index, array }), [item, index, array])
      );
    }

    const conditions = Array.isArray(config.conditions) ? config.conditions : [];
    const checks = conditions.map((condition) => {
      const actual = resolvePath(item, String(condition.field ?? condition.path ?? ''));
      const expected = parseConfigValue(condition.value, condition.value);
      return compareValues(actual, String(condition.operator ?? 'eq'), expected);
    });

    return logic === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
  });

  return {
    output,
    metadata: {
      count: output.length,
      filteredOut: input.length - output.length,
    },
  };
});

const transformMapExecutor = createExecutor('Transform Map', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeArrayInput(getResolvedInput(config, context), NodeType.TRANSFORM_MAP);
  const expression = interpolate(String(config.expression ?? config.transformation ?? 'item'), context);

  const output = input.map((item, index, array) =>
    executeExpression(expression, createScope(context, input, { item, index, array }), [item, index, array])
  );

  return {
    output,
    metadata: {
      count: output.length,
    },
  };
});

const transformReduceExecutor = createExecutor('Transform Reduce', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeArrayInput(getResolvedInput(config, context), NodeType.TRANSFORM_REDUCE);
  const expression = interpolate(String(config.expression ?? config.reducer ?? 'acc'), context);
  const hasInitial = config.initialValue !== undefined;
  const initialValue = hasInitial ? config.initialValue : undefined;

  if (input.length === 0 && !hasInitial) {
    throw new Error('Transform Reduce requires a non-empty array or an initialValue.');
  }

  const output = hasInitial
    ? input.reduce((accumulator, item, index, array) =>
        executeExpression(
          expression,
          createScope(context, input, { accumulator, acc: accumulator, item, index, array }),
          [accumulator, item, index, array]
        ),
      initialValue)
    : input.slice(1).reduce((accumulator, item, index, array) =>
        executeExpression(
          expression,
          createScope(context, input, { accumulator, acc: accumulator, item, index: index + 1, array: input }),
          [accumulator, item, index + 1, input]
        ),
      input[0]);

  return {
    output,
    metadata: {
      count: input.length,
    },
  };
});

const transformAggregateExecutor = createExecutor('Transform Aggregate', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeArrayInput(getResolvedInput(config, context), NodeType.TRANSFORM_AGGREGATE);
  const rawGroupBy = config.groupBy ?? config.groupByFields ?? [];
  const groupBy = Array.isArray(rawGroupBy)
    ? rawGroupBy.map(String)
    : String(rawGroupBy)
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean);
  const aggregations = Array.isArray(config.aggregations) ? config.aggregations : [];

  const groups = new Map<string, any[]>();
  input.forEach((item) => {
    const key = JSON.stringify(groupBy.map((field) => resolvePath(item, field)));
    const items = groups.get(key) ?? [];
    items.push(item);
    groups.set(key, items);
  });

  const output = Array.from(groups.entries()).map(([key, items]) => {
    const groupValues = JSON.parse(key) as any[];
    const result: Record<string, any> = {};

    groupBy.forEach((field, index) => {
      const fieldName = field.split('.').pop() || field;
      result[fieldName] = groupValues[index];
    });

    aggregations.forEach((aggregation) => {
      const field = String(aggregation.field ?? '');
      const alias = String(aggregation.alias ?? `${aggregation.function}_${field || 'items'}`);
      const values = field
        ? items.map((item) => resolvePath(item, field)).filter((value) => value !== undefined && value !== null)
        : items;

      switch (aggregation.function) {
        case 'sum':
          result[alias] = values.reduce((sum, value) => sum + Number(value), 0);
          break;
        case 'avg':
          result[alias] = values.length
            ? values.reduce((sum, value) => sum + Number(value), 0) / values.length
            : 0;
          break;
        case 'count':
          result[alias] = values.length;
          break;
        case 'min':
          result[alias] = values.length ? values.reduce((min, value) => (Number(value) < Number(min) ? value : min)) : null;
          break;
        case 'max':
          result[alias] = values.length ? values.reduce((max, value) => (Number(value) > Number(max) ? value : max)) : null;
          break;
        case 'first':
          result[alias] = values[0] ?? null;
          break;
        case 'last':
          result[alias] = values[values.length - 1] ?? null;
          break;
        default:
          throw new Error(`Unsupported aggregation function: ${aggregation.function}`);
      }
    });

    result.items = items;
    return result;
  });

  return {
    output,
    metadata: {
      groups: output.length,
    },
  };
});

const transformSplitExecutor = createExecutor('Transform Split', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const mode = String(config.mode ?? (Array.isArray(input) ? 'chunk' : 'delimiter'));
  const size = Math.max(1, Number(config.chunkSize ?? config.size ?? 1));
  const delimiter = String(config.delimiter ?? ',');

  if (Array.isArray(input)) {
    const output: any[] = [];
    for (let index = 0; index < input.length; index += 1) {
      if (mode === 'chunk') {
        if (index % size === 0) output.push(input.slice(index, index + size));
      } else {
        output.push(input[index]);
      }
    }

    return {
      output,
      metadata: {
        chunks: output.length,
      },
    };
  }

  if (typeof input !== 'string') {
    throw new Error('Transform Split expects string or array input.');
  }

  let output: any[];
  switch (mode) {
    case 'lines':
      output = input.split(/\r?\n/);
      break;
    case 'chars':
      output = [...input];
      break;
    case 'regex':
      output = input.split(new RegExp(String(config.pattern ?? delimiter), String(config.flags ?? '')));
      break;
    case 'fixedLength':
    case 'chunk': {
      output = [];
      for (let index = 0; index < input.length; index += size) {
        output.push(input.slice(index, index + size));
      }
      break;
    }
    default:
      output = input.split(delimiter);
      break;
  }

  return {
    output,
    metadata: {
      chunks: output.length,
    },
  };
});

const transformMergeExecutor = createExecutor('Transform Merge', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeInput(getResolvedInput(config, context));
  const arrayStrategy = String(config.arrayStrategy ?? 'concat') as 'concat' | 'replace';
  const sources = Array.isArray(config.sources)
    ? config.sources.map((source) => (typeof source === 'string' ? resolvePath({ input, variables: context.variables, nodes: context.nodeOutputs }, source) : source))
    : normalizeArrayInput(input, NodeType.TRANSFORM_MERGE);
  const objects = sources.filter((value) => isRecord(value));

  if (objects.length === 0) {
    throw new Error('Transform Merge requires object inputs.');
  }

  const output = objects.reduce((accumulator, value) => deepMerge(accumulator, value, arrayStrategy), {});
  return {
    output,
    metadata: {
      merged: objects.length,
    },
  };
});

const transformSortExecutor = createExecutor('Transform Sort', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeArrayInput(getResolvedInput(config, context), NodeType.TRANSFORM_SORT);
  const fields = Array.isArray(config.fields)
    ? config.fields
    : [{ field: config.field ?? config.sortBy ?? '', direction: config.direction ?? 'asc' }];

  const output = input
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      for (const rule of fields) {
        const field = String(rule.field ?? '').trim();
        const direction = String(rule.direction ?? 'asc').toLowerCase() === 'desc' ? -1 : 1;
        const leftValue = field ? resolvePath(left.item, field) : left.item;
        const rightValue = field ? resolvePath(right.item, field) : right.item;
        const comparableLeft = toComparableValue(leftValue);
        const comparableRight = toComparableValue(rightValue);
        if (comparableLeft < comparableRight) return -1 * direction;
        if (comparableLeft > comparableRight) return 1 * direction;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.item);

  return {
    output,
    metadata: {
      count: output.length,
    },
  };
});

const transformDedupeExecutor = createExecutor('Transform Dedupe', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = normalizeArrayInput(getResolvedInput(config, context), NodeType.TRANSFORM_DEDUPE);
  const keyField = config.keyField ?? config.field;
  const expression = config.expression ? interpolate(String(config.expression), context) : undefined;
  const keep = String(config.keep ?? 'first');
  const seen = new Map<string, any>();

  input.forEach((item, index, array) => {
    const key = expression
      ? executeExpression(expression, createScope(context, input, { item, index, array }), [item, index, array])
      : keyField
        ? resolvePath(item, String(keyField))
        : item;
    const serializedKey = JSON.stringify(key);
    if (!seen.has(serializedKey) || keep === 'last') {
      seen.set(serializedKey, item);
    }
  });

  const output = Array.from(seen.values());
  return {
    output,
    metadata: {
      removed: input.length - output.length,
    },
  };
});

const transformJsonExecutor = createExecutor('Transform JSON', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const operation = String(config.operation ?? 'parse');

  switch (operation) {
    case 'parse': {
      if (typeof input !== 'string') return { output: input, metadata: { parsed: true } };
      return { output: JSON.parse(input), metadata: { parsed: true } };
    }
    case 'stringify':
      return { output: JSON.stringify(input, null, Number(config.spacing ?? 0)), metadata: { stringified: true } };
    case 'validate': {
      if (typeof input !== 'string') {
        return { output: input, metadata: { valid: true } };
      }
      try {
        const parsed = JSON.parse(input);
        return { output: parsed, metadata: { valid: true } };
      } catch (error) {
        return {
          output: input,
          metadata: {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }
    case 'format': {
      const parsed = typeof input === 'string' ? JSON.parse(input) : input;
      return { output: JSON.stringify(parsed, null, Number(config.spacing ?? 2)), metadata: { formatted: true } };
    }
    default:
      throw new Error(`Unsupported JSON operation: ${operation}`);
  }
});

const transformXmlExecutor = createExecutor('Transform XML', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const operation = String(config.operation ?? 'parse');

  switch (operation) {
    case 'parse': {
      if (typeof input !== 'string') throw new Error('Transform XML parse expects string input.');
      const parsed = parseXml(input);
      const output = config.preserveRoot === false ? xmlToObject(parsed) : { [parsed.name]: xmlToObject(parsed) };
      return { output, metadata: { root: parsed.name } };
    }
    case 'validate': {
      try {
        parseXml(String(input ?? ''));
        return { output: input, metadata: { valid: true } };
      } catch (error) {
        return {
          output: input,
          metadata: {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }
    case 'stringify':
    case 'serialize':
      return { output: objectToXml(input, String(config.rootName ?? 'root')), metadata: { serialized: true } };
    default:
      throw new Error(`Unsupported XML operation: ${operation}`);
  }
});

const transformCsvExecutor = createExecutor('Transform CSV', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const operation = String(config.operation ?? 'parse');
  const delimiter = String(config.delimiter ?? ',');

  switch (operation) {
    case 'parse': {
      if (typeof input !== 'string') throw new Error('Transform CSV parse expects string input.');
      const rows = parseCsv(input, delimiter);
      const output = config.headers === false
        ? rows
        : (() => {
            const [headerRow = [], ...dataRows] = rows;
            return dataRows.map((row) =>
              Object.fromEntries(headerRow.map((header, index) => [header || `column_${index + 1}`, row[index] ?? '']))
            );
          })();
      return { output, metadata: { rows: output.length } };
    }
    case 'stringify':
    case 'serialize': {
      const rows = normalizeArrayInput(input, NodeType.TRANSFORM_CSV);
      return { output: stringifyCsv(rows, delimiter, config.headers !== false), metadata: { serialized: true } };
    }
    default:
      throw new Error(`Unsupported CSV operation: ${operation}`);
  }
});

const transformYamlExecutor = createExecutor('Transform YAML', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = getResolvedInput(config, context);
  const operation = String(config.operation ?? 'parse');

  switch (operation) {
    case 'parse':
      if (typeof input !== 'string') throw new Error('Transform YAML parse expects string input.');
      return { output: parseYaml(input), metadata: { parsed: true } };
    case 'stringify':
    case 'serialize':
      return { output: stringifyYaml(input), metadata: { serialized: true } };
    default:
      throw new Error(`Unsupported YAML operation: ${operation}`);
  }
});

const transformHtmlExecutor = createExecutor('Transform HTML', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = String(getResolvedInput(config, context) ?? '');
  const selector = config.selector ? String(config.selector) : undefined;
  const operation = String(config.operation ?? 'extractText');
  const matches = selector ? findHtmlMatches(input, selector) : [];

  switch (operation) {
    case 'extractText': {
      const output = selector
        ? config.all
          ? matches.map((match) => match.text)
          : matches[0]?.text ?? ''
        : decodeHtmlEntities(input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      return { output, metadata: { matches: matches.length } };
    }
    case 'extractHtml':
      return {
        output: config.all ? matches.map((match) => match.outerHtml) : matches[0]?.outerHtml ?? '',
        metadata: { matches: matches.length },
      };
    case 'extractAttribute': {
      const attribute = String(config.attribute ?? 'href');
      return {
        output: config.all
          ? matches.map((match) => match.attributes[attribute]).filter((value) => value !== undefined)
          : matches[0]?.attributes[attribute] ?? null,
        metadata: { matches: matches.length },
      };
    }
    default:
      throw new Error(`Unsupported HTML operation: ${operation}`);
  }
});

const transformRegexExecutor = createExecutor('Transform Regex', async (node, _definition, context) => {
  const config = getConfig(node, context);
  const input = String(getResolvedInput(config, context) ?? '');
  const operation = String(config.operation ?? 'match');
  const pattern = interpolate(String(config.pattern ?? ''), context);
  const flags = String(config.flags ?? 'g');
  const regex = new RegExp(pattern, flags);

  switch (operation) {
    case 'match': {
      const output = Array.from(input.matchAll(regex)).map((match) => match[0]);
      return { output, metadata: { count: output.length } };
    }
    case 'extract': {
      const output = Array.from(input.matchAll(regex)).map((match) => {
        if (config.group !== undefined) return match[Number(config.group)] ?? null;
        return match.length > 1 ? match.slice(1) : match[0];
      });
      return { output, metadata: { count: output.length } };
    }
    case 'replace':
      return { output: input.replace(regex, interpolate(String(config.replacement ?? ''), context)) };
    case 'split':
      return { output: input.split(regex) };
    case 'test':
      return { output: regex.test(input) };
    default:
      throw new Error(`Unsupported regex operation: ${operation}`);
  }
});

export const transformExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.TRANSFORM_DATA]: transformDataExecutor,
  [NodeType.TRANSFORM_FILTER]: transformFilterExecutor,
  [NodeType.TRANSFORM_MAP]: transformMapExecutor,
  [NodeType.TRANSFORM_REDUCE]: transformReduceExecutor,
  [NodeType.TRANSFORM_AGGREGATE]: transformAggregateExecutor,
  [NodeType.TRANSFORM_SPLIT]: transformSplitExecutor,
  [NodeType.TRANSFORM_MERGE]: transformMergeExecutor,
  [NodeType.TRANSFORM_SORT]: transformSortExecutor,
  [NodeType.TRANSFORM_DEDUPE]: transformDedupeExecutor,
  [NodeType.TRANSFORM_JSON]: transformJsonExecutor,
  [NodeType.TRANSFORM_XML]: transformXmlExecutor,
  [NodeType.TRANSFORM_CSV]: transformCsvExecutor,
  [NodeType.TRANSFORM_YAML]: transformYamlExecutor,
  [NodeType.TRANSFORM_HTML]: transformHtmlExecutor,
  [NodeType.TRANSFORM_REGEX]: transformRegexExecutor,
};
