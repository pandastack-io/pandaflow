/* eslint-disable @typescript-eslint/no-explicit-any */
import { Node } from 'reactflow';
import { JSONPath } from 'jsonpath-plus';
import JSZip from 'jszip';
import { NodeType, WorkflowNodeData } from '@/types/nodes';
import { NodeExecutorFn, ExecutorContext } from './types';
import {
  interpolate,
  interpolateDeep,
  withRetry,
  fetchWithTimeout,
  resolveNodeInput,
  safeJsonParse,
} from './utils';

type WorkflowNode = Node<WorkflowNodeData>;
type GenericConfig = Record<string, any>;

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_RETRIES = 3;

function getConfig(node: WorkflowNode, context: ExecutorContext): GenericConfig {
  return interpolateDeep((node.data?.config ?? {}) as GenericConfig, context);
}

function getTimeout(config: GenericConfig): number {
  const timeout = Number(config.timeout ?? DEFAULT_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
}

function getRetries(config: GenericConfig): number {
  const retries = Number(config.retries ?? DEFAULT_RETRIES);
  return Number.isFinite(retries) && retries > 0 ? retries : DEFAULT_RETRIES;
}

function getResolvedInput(config: GenericConfig, context: ExecutorContext): any {
  const value = resolveNodeInput(context, config.inputVariable);
  if (typeof value !== 'string') return value;
  const parsed = safeJsonParse(value);
  return parsed === value ? value : parsed;
}

function toScalar(value: string): any {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return safeJsonParse(trimmed);
  }
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed === String(numeric)) return numeric;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function decodeContent(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) {
    const [, data] = trimmed.split(',', 2);
    return Buffer.from(data ?? '', 'base64').toString('utf8');
  }
  const base64Pattern = /^[A-Za-z0-9+/=\r\n]+$/;
  if (base64Pattern.test(trimmed) && trimmed.length % 4 === 0) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      if (decoded.trim()) return decoded;
    } catch {
      return value;
    }
  }
  return value;
}

async function fetchText(url: string, config: GenericConfig): Promise<{ content: string; contentType: string | null }> {
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const response = await withRetry(
    async () => {
      const result = await fetchWithTimeout(url, { timeout, headers: safeJsonParse(config.headers ?? '{}') });
      if (!result.ok) {
        throw new Error(`Failed to fetch ${url}: ${result.status}`);
      }
      return result;
    },
    {
      maxAttempts: retries,
      retryOn: () => true,
    }
  );

  return {
    content: await response.text(),
    contentType: response.headers.get('content-type'),
  };
}

async function fetchBinary(url: string, config: GenericConfig): Promise<{ bytes: Buffer; contentType: string | null }> {
  const timeout = getTimeout(config);
  const retries = getRetries(config);
  const response = await withRetry(
    async () => {
      const result = await fetchWithTimeout(url, { timeout, headers: safeJsonParse(config.headers ?? '{}') });
      if (!result.ok) {
        throw new Error(`Failed to fetch ${url}: ${result.status}`);
      }
      return result;
    },
    {
      maxAttempts: retries,
      retryOn: () => true,
    }
  );

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}


function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function parseSharedStrings(xml: string): string[] {
  const matches = Array.from(xml.matchAll(/<si[\s\S]*?<\/si>/g));
  return matches.map((match) => {
    const textParts = Array.from(match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((part) => decodeXmlText(part[1]));
    return textParts.join('');
  });
}

function columnLabelToIndex(label: string): number {
  return label.split('').reduce((acc, char) => acc * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}

function parseCellValue(cellXml: string, sharedStrings: string[]): any {
  const typeMatch = cellXml.match(/\bt="([^"]+)"/);
  const rawValue = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1]
    ?? cellXml.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]
    ?? '';
  const value = decodeXmlText(rawValue);
  switch (typeMatch?.[1]) {
    case 's':
      return sharedStrings[Number(value)] ?? '';
    case 'b':
      return value === '1';
    case 'inlineStr':
    case 'str':
      return value;
    default: {
      const numeric = Number(value);
      return value !== '' && !Number.isNaN(numeric) ? numeric : value;
    }
  }
}

function parseWorksheetXml(xml: string, sharedStrings: string[]): { rows: Array<Record<string, any>>; headers: string[] } {
  const rowMatches = Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g));
  const matrix: string[][] = rowMatches.map((rowMatch) => {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const ref = attrs.match(/\br="([A-Z]+)(\d+)"/)?.[1] || "";
      const columnIndex = ref ? columnLabelToIndex(ref) : cells.length;
      cells[columnIndex] = String(parseCellValue(`<c ${attrs}>${cellMatch[2]}</c>`, sharedStrings) ?? '');
    }
    return cells;
  });

  if (matrix.length === 0) {
    return { rows: [], headers: [] };
  }

  const headers = matrix[0].map((header, index) => header || `column_${index + 1}`);
  const rows = matrix.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, toScalar(row[index] ?? '')]))
  );
  return { rows, headers };
}

async function parseXlsxWorkbook(bytes: Buffer): Promise<Array<{ name: string; rows: Array<Record<string, any>>; headers: string[] }>> {
  const zip = await JSZip.loadAsync(bytes);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  if (!workbookXml) {
    throw new Error('Workbook XML not found in XLSX file.');
  }
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const relationMap = Object.fromEntries(
    Array.from((relsXml || '').matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)).map((match) => [match[1], match[2]])
  );
  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?/g)) {
    const name = decodeXmlText(match[1]);
    const relTarget = relationMap[match[2]];
    if (!relTarget) continue;
    const normalizedTarget = relTarget.replace(/^\//, '').replace(/^\.\//, '');
    const sheetPath = normalizedTarget.startsWith('xl/') ? normalizedTarget : `xl/${normalizedTarget.replace(/^\/+/, '')}`;
    const sheetXml = await zip.file(sheetPath)?.async('string');
    if (!sheetXml) continue;
    const parsed = parseWorksheetXml(sheetXml, sharedStrings);
    sheets.push({ name, ...parsed });
  }
  return sheets;
}

async function resolveSource(config: GenericConfig, context: ExecutorContext): Promise<{ content: string; source: string; contentType?: string | null }> {
  if (config.url) {
    const url = interpolate(String(config.url), context);
    const fetched = await fetchText(url, config);
    return { content: fetched.content, source: url, contentType: fetched.contentType };
  }
  if (config.content !== undefined) {
    return {
      content: decodeContent(String(config.content)),
      source: config.sourceType ?? 'inline',
    };
  }

  const input = getResolvedInput(config, context);
  if (typeof input === 'string') {
    return { content: decodeContent(input), source: config.inputVariable ?? 'input' };
  }

  return {
    content: JSON.stringify(input ?? null),
    source: config.inputVariable ?? 'input',
  };
}

function parseCsv(text: string, delimiter = ','): { rows: Array<Record<string, any>>; headers: string[] } {
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') index += 1;
      currentRow.push(currentField);
      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { rows: [], headers: [] };
  }

  const hasHeaders = rows.length > 0;
  const headers = (hasHeaders ? rows[0] : []).map((header, index) => header || `column_${index + 1}`);
  const dataRows = rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, toScalar(row[index] ?? '')]))
  );

  return { rows: dataRows, headers };
}

function parseXmlAttributes(segment: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributeRegex = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attributeRegex.exec(segment))) {
    attributes[match[1]] = match[2];
  }
  return attributes;
}

function parseXml(text: string): any {
  const xml = text
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .trim();
  let index = 0;

  const consumeWhitespace = () => {
    while (/\s/.test(xml[index] ?? '')) index += 1;
  };

  const parseNode = (): { name: string; value: any } | null => {
    consumeWhitespace();
    if (xml[index] !== '<' || xml[index + 1] === '/') return null;
    const endTagIndex = xml.indexOf('>', index);
    const tagContent = xml.slice(index + 1, endTagIndex);
    const selfClosing = tagContent.endsWith('/');
    const normalizedTag = selfClosing ? tagContent.slice(0, -1).trim() : tagContent.trim();
    const [name] = normalizedTag.split(/\s+/, 1);
    const attributes = parseXmlAttributes(normalizedTag);
    index = endTagIndex + 1;

    if (selfClosing) {
      return {
        name,
        value: Object.keys(attributes).length > 0 ? { _attributes: attributes } : '',
      };
    }

    const children: Record<string, any> = {};
    let textContent = '';

    while (index < xml.length) {
      if (xml[index] === '<' && xml[index + 1] === '/') {
        const closingEnd = xml.indexOf('>', index);
        index = closingEnd + 1;
        break;
      }
      if (xml[index] === '<') {
        const child = parseNode();
        if (child) {
          if (children[child.name] !== undefined) {
            children[child.name] = Array.isArray(children[child.name])
              ? [...children[child.name], child.value]
              : [children[child.name], child.value];
          } else {
            children[child.name] = child.value;
          }
        }
      } else {
        textContent += xml[index];
        index += 1;
      }
    }

    const trimmedText = textContent.trim();
    if (Object.keys(children).length === 0 && Object.keys(attributes).length === 0) {
      return { name, value: trimmedText };
    }

    const result: Record<string, any> = { ...children };
    if (Object.keys(attributes).length > 0) result._attributes = attributes;
    if (trimmedText) result._text = trimmedText;
    return { name, value: result };
  };

  const root = parseNode();
  return root ? { [root.name]: root.value } : {};
}

function parseYaml(text: string): any {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'));

  const root: any = {};
  const stack: Array<{ indent: number; container: any; key?: string }> = [{ indent: -1, container: root }];

  const getParent = (indent: number) => {
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    return stack[stack.length - 1];
  };

  lines.forEach((line, index) => {
    const indent = line.match(/^\s*/)![0].length;
    const trimmed = line.trim();
    const parentEntry = getParent(indent);

    if (trimmed.startsWith('- ')) {
      const itemValue = trimmed.slice(2);
      if (!Array.isArray(parentEntry.container)) {
        const targetKey = parentEntry.key;
        if (targetKey) {
          parentEntry.container[targetKey] = [];
          parentEntry.container = parentEntry.container[targetKey];
        }
      }
      if (!Array.isArray(parentEntry.container)) {
        throw new Error(`Invalid YAML list near line ${index + 1}`);
      }
      if (itemValue.includes(': ') || itemValue.endsWith(':')) {
        const [rawKey, ...rest] = itemValue.split(':');
        const key = rawKey.trim();
        const valuePart = rest.join(':').trim();
        const item = valuePart ? { [key]: toScalar(valuePart) } : { [key]: {} };
        parentEntry.container.push(item);
        stack.push({ indent, container: item, key: valuePart ? undefined : key });
      } else {
        parentEntry.container.push(toScalar(itemValue));
      }
      return;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, colonIndex).trim();
    const valuePart = trimmed.slice(colonIndex + 1).trim();
    if (valuePart) {
      parentEntry.container[key] = toScalar(valuePart);
      return;
    }

    const nextLine = lines[index + 1] ?? '';
    const nextTrimmed = nextLine.trim();
    parentEntry.container[key] = nextTrimmed.startsWith('- ') ? [] : {};
    stack.push({ indent, container: parentEntry.container, key });
  });

  return root;
}

const csvReadExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const source = await resolveSource(config, context);
  const delimiter = String(config.delimiter ?? ',');
  const parsed = parseCsv(source.content, delimiter);
  const limitedRows = Number(config.limit) > 0 ? parsed.rows.slice(0, Number(config.limit)) : parsed.rows;

  return {
    output: {
      rows: limitedRows,
      headers: parsed.headers,
      count: limitedRows.length,
      source: source.source,
    },
    metadata: {
      nodeType: NodeType.DATA_CSV_READ,
      delimiter,
      contentType: source.contentType,
    },
  };
};

const jsonReadExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const source = await resolveSource(config, context);
  const parsed = safeJsonParse(source.content);
  if (parsed === source.content && typeof source.content === 'string') {
    throw new Error('JSON source could not be parsed.');
  }
  const output = config.jsonPath ? JSONPath({ path: String(config.jsonPath), json: parsed }) : parsed;

  return {
    output: {
      data: output,
      source: source.source,
      jsonPath: config.jsonPath,
    },
    metadata: {
      nodeType: NodeType.DATA_JSON_READ,
      contentType: source.contentType,
    },
  };
};

const xmlReadExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const source = await resolveSource(config, context);
  const parsed = parseXml(source.content);

  return {
    output: {
      data: parsed,
      source: source.source,
    },
    metadata: {
      nodeType: NodeType.DATA_XML_READ,
      contentType: source.contentType,
    },
  };
};

const yamlReadExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  const source = await resolveSource(config, context);
  const parsed = parseYaml(source.content);

  return {
    output: {
      data: parsed,
      source: source.source,
    },
    metadata: {
      nodeType: NodeType.DATA_YAML_READ,
      contentType: source.contentType,
    },
  };
};

const excelReadExecutor: NodeExecutorFn = async (node, _definition, context) => {
  const config = getConfig(node, context);
  if (!config.url && config.content === undefined) {
    throw new Error('Excel reader requires a URL or base64 content.');
  }

  const result = config.url
    ? await fetchBinary(interpolate(String(config.url), context), config)
    : {
        bytes: Buffer.from(String(config.content).replace(/^data:[^,]+,/, ''), 'base64'),
        contentType: null,
      };
  const signature = result.bytes.subarray(0, 4).toString('hex');
  const isZipContainer = signature === '504b0304';
  if (!isZipContainer) {
    throw new Error('Excel reader currently supports .xlsx files only.');
  }

  const sheets = await parseXlsxWorkbook(result.bytes);
  const firstSheet = sheets[0] ?? { name: 'Sheet1', rows: [], headers: [] };
  const limit = Number(config.limit) > 0 ? Number(config.limit) : undefined;
  const normalizedSheets = sheets.map((sheet) => ({
    ...sheet,
    rows: limit ? sheet.rows.slice(0, limit) : sheet.rows,
    count: limit ? Math.min(sheet.rows.length, limit) : sheet.rows.length,
  }));

  return {
    output: {
      rows: normalizedSheets[0]?.rows ?? [],
      headers: normalizedSheets[0]?.headers ?? [],
      count: normalizedSheets[0]?.count ?? 0,
      sheetName: normalizedSheets[0]?.name ?? firstSheet.name,
      sheets: normalizedSheets,
      source: config.url ?? 'inline',
      mimeType: result.contentType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: result.bytes.byteLength,
      workbookFormat: 'xlsx',
    },
    metadata: {
      nodeType: NodeType.DATA_EXCEL_READ,
      contentType: result.contentType,
      sheetCount: normalizedSheets.length,
    },
  };
};

export const dataExecutors: Partial<Record<NodeType, NodeExecutorFn>> = {
  [NodeType.DATA_CSV_READ]: csvReadExecutor,
  [NodeType.DATA_JSON_READ]: jsonReadExecutor,
  [NodeType.DATA_XML_READ]: xmlReadExecutor,
  [NodeType.DATA_YAML_READ]: yamlReadExecutor,
  [NodeType.DATA_EXCEL_READ]: excelReadExecutor,
};
