'use client';

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import * as LucideIcons from 'lucide-react';
import { Search, Sparkles } from 'lucide-react';
import { BrandIcon } from '@/components/ui/brand-icon';
import { Input } from '@/components/ui/input';
import { getProviderIcon } from '@/lib/credentials/brand-icons';
import { nodeRegistry } from '@/lib/nodes/registry';
import { NodeCategory, NodeType } from '@/types/nodes';

interface QuickAddMenuProps {
  x: number;
  y: number;
  onSelect: (nodeType: NodeType) => void;
  onClose: () => void;
}

const MENU_WIDTH = 280;
const MENU_MAX_HEIGHT = 400;
const MENU_OFFSET = 12;
const VIEWPORT_MARGIN = 16;

const suggestedNodeTypes: NodeType[] = [
  NodeType.AI_LLM,
  NodeType.SANDFLARE_PYTHON,
  NodeType.INTEGRATION_HTTP,
  NodeType.CONTROL_CONDITION,
  NodeType.UTILITY_DELAY,
  NodeType.OUTPUT_RESPONSE,
];

const categoryLabels: Record<NodeCategory, string> = {
  [NodeCategory.TRIGGER]: 'Triggers',
  [NodeCategory.SANDFLARE]: 'Sandflare',
  [NodeCategory.AGENT]: 'Agents',
  [NodeCategory.MEMORY]: 'Memory',
  [NodeCategory.AI]: 'AI & ML',
  [NodeCategory.PRISM]: 'Prism',
  [NodeCategory.TOOL]: 'Tools',
  [NodeCategory.ANALYTICS]: 'Analytics',
  [NodeCategory.RAG]: 'RAG',
  [NodeCategory.EMBEDDING]: 'Embeddings',
  [NodeCategory.VECTORSTORE]: 'Vector Stores',
  [NodeCategory.TRANSFORM]: 'Transform',
  [NodeCategory.CONTROL]: 'Control Flow',
  [NodeCategory.INTEGRATION]: 'Integrations',
  [NodeCategory.LOADER]: 'Loaders',
  [NodeCategory.OUTPUT]: 'Output',
  [NodeCategory.UTILITY]: 'Utilities',
  [NodeCategory.DATA]: 'Data',
  [NodeCategory.VERDICT]: 'Verdict',
};

function QuickAddNodeButton({
  nodeType,
  compact = false,
  onSelect,
}: {
  nodeType: NodeType;
  compact?: boolean;
  onSelect: (nodeType: NodeType) => void;
}) {
  const node = nodeRegistry[nodeType];

  if (!node) {
    return null;
  }

  const iconName = (node.icon || 'Box') as keyof typeof LucideIcons;
  const IconComponent = (LucideIcons[iconName] || LucideIcons.Box) as ComponentType<{ className?: string }>;
  const brandIcon = getProviderIcon(
    typeof node.defaultConfig?.provider === 'string' ? node.defaultConfig.provider : null,
    node.brandIcon,
    node.type.split('.').slice(1).join('.'),
    node.type.split('.').at(-1)
  );

  return (
    <button
      type="button"
      className={compact
        ? 'flex w-full items-start gap-2 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-accent'
        : 'flex min-w-0 items-center gap-2 rounded-md border border-border/60 px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-accent'}
      title={node.description}
      onClick={() => onSelect(node.type)}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: `${node.color}20`,
          color: node.color,
        }}
      >
        {brandIcon ? <BrandIcon icon={brandIcon} size={14} branded={false} /> : <IconComponent className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{node.name}</div>
        {compact && <div className="truncate text-[11px] text-muted-foreground">{node.description}</div>}
      </div>
    </button>
  );
}

export function QuickAddMenu({ x, y, onSelect, onClose }: QuickAddMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredNodes = useMemo(
    () => Object.values(nodeRegistry)
      .filter((node) => {
        if (!normalizedQuery) {
          return true;
        }

        return (
          node.name.toLowerCase().includes(normalizedQuery) ||
          node.description.toLowerCase().includes(normalizedQuery) ||
          node.type.toLowerCase().includes(normalizedQuery) ||
          String(node.category).toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    [normalizedQuery]
  );

  const suggestedNodes = useMemo(
    () => suggestedNodeTypes.filter((nodeType) => nodeRegistry[nodeType]),
    []
  );

  const nodesByCategory = useMemo(
    () => Object.values(NodeCategory)
      .map((category) => ({
        category,
        nodes: filteredNodes.filter((node) => node.category === category),
      }))
      .filter((group) => group.nodes.length > 0),
    [filteredNodes]
  );

  const menuPosition = useMemo(() => {
    if (typeof window === 'undefined') {
      return { left: x, top: y };
    }

    let left = x + MENU_OFFSET;
    if (left + MENU_WIDTH + VIEWPORT_MARGIN > window.innerWidth) {
      left = Math.max(VIEWPORT_MARGIN, x - MENU_WIDTH - MENU_OFFSET);
    }

    let top = y - 24;
    if (top + MENU_MAX_HEIGHT + VIEWPORT_MARGIN > window.innerHeight) {
      top = Math.max(VIEWPORT_MARGIN, y - MENU_MAX_HEIGHT + 24);
    }

    return {
      left,
      top: Math.max(VIEWPORT_MARGIN, top),
    };
  }, [x, y]);

  const handleSelect = (nodeType: NodeType) => {
    onSelect(nodeType);
    onClose();
  };

  return (
    <div
      ref={containerRef}
      className="nodrag nopan nowheel fixed z-[9999] w-[280px] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      style={menuPosition}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto p-3">
        {!normalizedQuery && suggestedNodes.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Suggested
            </div>
            <div className="grid grid-cols-2 gap-2">
              {suggestedNodes.map((nodeType) => (
                <QuickAddNodeButton key={`suggested-${nodeType}`} nodeType={nodeType} onSelect={handleSelect} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {nodesByCategory.map(({ category, nodes }) => (
            <div key={category}>
              <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {categoryLabels[category]}
              </div>
              <div className="space-y-1">
                {nodes.map((node) => (
                  <QuickAddNodeButton key={node.type} nodeType={node.type} compact onSelect={handleSelect} />
                ))}
              </div>
            </div>
          ))}

          {nodesByCategory.length === 0 && (
            <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No nodes found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
