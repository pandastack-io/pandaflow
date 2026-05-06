'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, FileJson, Text, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NodeExecutionOutput } from '@/types/nodes';
import { JsonTree } from './json-tree';

interface OutputViewerProps extends NodeExecutionOutput {
  className?: string;
}

function stringifyValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeMarkdown(value: string) {
  return /(^#\s)|(```)|(^[-*+]\s)|(^\d+\.\s)|(^>\s)|\[[^\]]+\]\([^)]+\)/m.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightJson(value: unknown) {
  const escaped = escapeHtml(stringifyValue(value));

  return escaped.replace(
    /(\"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\\"])*\"\s*:?)|(\btrue\b|\bfalse\b|\bnull\b)|(-?\b\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?\b)/g,
    (match) => {
      if (/^\"/.test(match) && /:\s*$/.test(match)) {
        return `<span style=\"color: var(--color-sky-400)\">${match}</span>`;
      }
      if (/^\"/.test(match)) {
        return `<span style=\"color: var(--color-green-400)\">${match}</span>`;
      }
      if (/true|false/.test(match)) {
        return `<span style=\"color: var(--color-violet-400)\">${match}</span>`;
      }
      if (/null/.test(match)) {
        return `<span style=\"color: var(--color-red-400)\">${match}</span>`;
      }
      return `<span style=\"color: var(--color-amber-400)\">${match}</span>`;
    }
  );
}

function Section({
  title,
  tone = 'default',
  defaultOpen = true,
  icon,
  onCopy,
  children,
}: {
  title: string;
  tone?: 'default' | 'success' | 'error';
  defaultOpen?: boolean;
  icon?: ReactNode;
  onCopy?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const toneClassName = {
    default: 'border-border bg-card',
    success: 'border-green-500/20 bg-green-500/5',
    error: 'border-red-500/20 bg-red-500/5',
  }[tone];

  return (
    <div className={cn('overflow-hidden rounded-xl border', toneClassName)}>
      <div className="flex items-center gap-2 border-b border-border/80 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {icon}
          <span className="truncate text-xs font-semibold text-foreground">{title}</span>
        </button>
        {onCopy && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const html = useMemo(() => highlightJson(value), [value]);

  return (
    <pre
      className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-xs leading-5 text-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function TextBlock({ value }: { value: string }) {
  const markdown = looksLikeMarkdown(value);

  return (
    <div
      className={cn(
        'max-h-[32rem] overflow-y-auto rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground',
        markdown ? 'whitespace-pre-wrap leading-6' : 'font-mono text-xs whitespace-pre-wrap leading-5'
      )}
    >
      {value}
    </div>
  );
}

function renderValue(value: unknown) {
  if (typeof value === 'string') {
    return <TextBlock value={value} />;
  }

  if (isPlainObject(value) || Array.isArray(value)) {
    return <JsonBlock value={value} />;
  }

  return <TextBlock value={stringifyValue(value)} />;
}

export function OutputViewer({ input, output, error, className }: OutputViewerProps) {
  const [activeView, setActiveView] = useState<'rendered' | 'raw'>('rendered');
  const hasInput = typeof input !== 'undefined';
  const hasOutput = typeof output !== 'undefined';
  const hasError = Boolean(error);
  const rawPayload = useMemo(
    () =>
      Object.fromEntries(
        [
          ['input', input],
          ['output', output],
          ['error', error],
        ].filter(([, value]) => typeof value !== 'undefined' && !(typeof value === 'string' && value.length === 0))
      ),
    [error, input, output]
  );

  if (!hasInput && !hasOutput && !hasError) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground',
          className
        )}
      >
        Run this workflow to inspect node input and output.
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="inline-flex rounded-full border border-border bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => setActiveView('rendered')}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            activeView === 'rendered' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Rendered
        </button>
        <button
          type="button"
          onClick={() => setActiveView('raw')}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            activeView === 'raw' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Raw
        </button>
      </div>

      {activeView === 'raw' ? (
        <Section
          title="Raw JSON"
          defaultOpen
          icon={<FileJson className="h-3.5 w-3.5 shrink-0 text-primary" />}
          onCopy={() => navigator.clipboard.writeText(stringifyValue(rawPayload))}
        >
          <JsonTree value={rawPayload} />
        </Section>
      ) : (
        <>
          {hasError && (
            <Section
              title="Error"
              tone="error"
              defaultOpen
              icon={<TriangleAlert className="h-3.5 w-3.5 shrink-0 text-red-500" />}
              onCopy={() => navigator.clipboard.writeText(error ?? '')}
            >
              <TextBlock value={error ?? ''} />
            </Section>
          )}

          {hasOutput && (
            <Section
              title="Output"
              tone={hasError ? 'default' : 'success'}
              defaultOpen
              icon={<FileJson className="h-3.5 w-3.5 shrink-0 text-green-500" />}
              onCopy={() => navigator.clipboard.writeText(stringifyValue(output))}
            >
              {renderValue(output)}
            </Section>
          )}

          {hasInput && (
            <Section
              title="Input"
              defaultOpen={false}
              icon={<Text className="h-3.5 w-3.5 shrink-0 text-primary" />}
              onCopy={() => navigator.clipboard.writeText(stringifyValue(input))}
            >
              {renderValue(input)}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
