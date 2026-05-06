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
    return <span className="text-emerald-400">&quot;{value}&quot;</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-amber-400">{value}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-violet-400">{String(value)}</span>;
  }

  if (value === null) {
    return <span className="text-red-400">null</span>;
  }

  if (typeof value === 'undefined') {
    return <span className="text-zinc-500">undefined</span>;
  }

  return <span className="text-zinc-200">{String(value)}</span>;
}

function JsonTreeNode({ nodeKey, value, depth = 0, defaultExpanded = false }: JsonTreeNodeProps) {
  const expandable = isObjectLike(value);
  const entries = useMemo(() => (expandable ? getEntries(value) : []), [expandable, value]);
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!expandable) {
    return (
      <div className="py-0.5" style={{ paddingLeft: depth * 14 }}>
        {nodeKey ? <span className="text-sky-400">{nodeKey}</span> : null}
        {nodeKey ? <span className="text-zinc-500">: </span> : null}
        {renderPrimitive(value)}
      </div>
    );
  }

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-1 rounded-sm py-0.5 text-left transition-colors hover:bg-white/5"
        style={{ paddingLeft: depth * 14 }}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />}
        {nodeKey ? <span className="text-sky-400">{nodeKey}</span> : <span className="text-zinc-200">root</span>}
        <span className="text-zinc-500">{getSummary(value)}</span>
      </button>

      {expanded && (
        <div>
          {entries.length > 0 ? (
            entries.map(([childKey, childValue]) => (
              <JsonTreeNode key={`${depth}-${childKey}`} nodeKey={childKey} value={childValue} depth={depth + 1} />
            ))
          ) : (
            <div className="py-0.5 text-zinc-500" style={{ paddingLeft: (depth + 1) * 14 }}>
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
        'overflow-auto rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs leading-6 text-zinc-100',
        className
      )}
    >
      {isObjectLike(value) ? (
        rootEntries.length > 0 ? (
          rootEntries.map(([childKey, childValue]) => <JsonTreeNode key={childKey} nodeKey={childKey} value={childValue} />)
        ) : (
          <div className="py-0.5 text-zinc-500">{Array.isArray(value) ? '[empty]' : '{empty}'}</div>
        )
      ) : (
        <JsonTreeNode value={value} />
      )}
    </div>
  );
}
