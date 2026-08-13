'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JsonTreeProps {
  value: unknown;
  className?: string;
}

interface JsonTreeNodeProps {
  nodeKey?: string;
  value: unknown;
  depth?: number;
  defaultExpanded?: boolean;
}

function isObjectLike(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

function getEntries(value: Record<string, unknown> | unknown[]) {
  return Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
}

function getSummary(value: Record<string, unknown> | unknown[]) {
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  return Array.isArray(value) ? `[${count} items]` : `{${count} items}`;
}

function renderPrimitive(value: unknown) {
  if (typeof value === 'string') {
    return <span className="text-emerald-600 dark:text-emerald-400">&quot;{value}&quot;</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-amber-600 dark:text-amber-400">{value}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-violet-600 dark:text-violet-400">{String(value)}</span>;
  }

  if (value === null) {
    return <span className="text-red-600 dark:text-red-400">null</span>;
  }

  if (typeof value === 'undefined') {
    return <span className="text-muted-foreground">undefined</span>;
  }

  return <span className="text-foreground">{String(value)}</span>;
}

function JsonTreeNode({ nodeKey, value, depth = 0, defaultExpanded = false }: JsonTreeNodeProps) {
  const expandable = isObjectLike(value);
  const entries = useMemo(() => (expandable ? getEntries(value) : []), [expandable, value]);
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!expandable) {
    return (
      <div className="py-0.5" style={{ paddingLeft: depth * 14 }}>
        {nodeKey ? <span className="text-sky-600 dark:text-sky-400">{nodeKey}</span> : null}
        {nodeKey ? <span className="text-muted-foreground">: </span> : null}
        {renderPrimitive(value)}
      </div>
    );
  }

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-1 rounded-sm py-0.5 text-left transition-colors hover:bg-accent"
        style={{ paddingLeft: depth * 14 }}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        {nodeKey ? <span className="text-sky-600 dark:text-sky-400">{nodeKey}</span> : <span className="text-foreground">root</span>}
        <span className="text-muted-foreground">{getSummary(value)}</span>
      </button>

      {expanded && (
        <div>
          {entries.length > 0 ? (
            entries.map(([childKey, childValue]) => (
              <JsonTreeNode key={`${depth}-${childKey}`} nodeKey={childKey} value={childValue} depth={depth + 1} />
            ))
          ) : (
            <div className="py-0.5 text-muted-foreground" style={{ paddingLeft: (depth + 1) * 14 }}>
              {Array.isArray(value) ? '[empty]' : '{empty}'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function JsonTree({ value, className }: JsonTreeProps) {
  const rootEntries = isObjectLike(value) ? getEntries(value) : [];

  return (
    <div
      className={cn(
        'overflow-auto rounded-xl border border-border bg-card px-3 py-2 font-mono text-xs leading-6 text-card-foreground',
        className
      )}
    >
      {isObjectLike(value) ? (
        rootEntries.length > 0 ? (
          rootEntries.map(([childKey, childValue]) => <JsonTreeNode key={childKey} nodeKey={childKey} value={childValue} />)
        ) : (
          <div className="py-0.5 text-muted-foreground">{Array.isArray(value) ? '[empty]' : '{empty}'}</div>
        )
      ) : (
        <JsonTreeNode value={value} />
      )}
    </div>
  );
}
