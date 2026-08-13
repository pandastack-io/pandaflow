'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from 'reactflow';
import { Search } from 'lucide-react';
import { getNodeByType } from '@/lib/nodes/registry';
import type { WorkflowNodeData } from '@/types/nodes';
import { cn } from '@/lib/utils';

type SearchResult = {
  id: string;
  name: string;
  type: string;
  color: string;
  position: { x: number; y: number };
};

interface NodeSearchProps {
  open: boolean;
  nodes: Node<WorkflowNodeData>[];
  onClose: () => void;
  onSelect: (nodeId: string) => void;
}

export function NodeSearch({ open, nodes, onClose, onSelect }: NodeSearchProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo<SearchResult[]>(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches: SearchResult[] = [];

    nodes.forEach((node) => {
      const nodeInfo = getNodeByType(node.data.type);
      if (!nodeInfo) {
        return;
      }

      const label = String(node.data.config?.label || '').trim();
      const name = label || nodeInfo.name;
      const isMatch =
        normalizedQuery.length === 0 ||
        label.toLowerCase().includes(normalizedQuery) ||
        nodeInfo.name.toLowerCase().includes(normalizedQuery);

      if (!isMatch) {
        return;
      }

      matches.push({
        id: node.id,
        name,
        type: node.data.type,
        color: nodeInfo.color,
        position: node.position,
      });
    });

    return matches.slice(0, 8);
  }, [nodes, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return;
    }

    const timeout = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(results.length > 0 ? 0 : -1);
    }
  }, [activeIndex, results.length]);

  if (!open) {
    return null;
  }

  const handleSelect = (nodeId: string) => {
    onSelect(nodeId);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-[45] flex justify-center bg-background/10 pt-[18vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-popover/95 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                setActiveIndex((current) => (results.length === 0 ? -1 : (current + 1 + results.length) % results.length));
                return;
              }

              if (event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                setActiveIndex((current) => (results.length === 0 ? -1 : (current - 1 + results.length) % results.length));
                return;
              }

              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                const selectedResult = results[activeIndex] ?? results[0];
                if (selectedResult) {
                  handleSelect(selectedResult.id);
                }
              }
            }}
            placeholder="Search nodes by label or name..."
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
           type="search" autoComplete="off" />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="rounded-xl px-4 py-6 text-center text-sm text-muted-foreground">
              No matching nodes found.
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((result, index) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => handleSelect(result.id)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                    activeIndex === index ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/70'
                  )}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: result.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{result.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{result.type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
