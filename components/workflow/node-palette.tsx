'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeCategory, NodeType } from '@/types/nodes';
import { nodeRegistry } from '@/lib/nodes/registry';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import * as LucideIcons from 'lucide-react';
import { Search, ChevronDown, ChevronRight, Star } from 'lucide-react';
import { BrandIcon } from '@/components/ui/brand-icon';
import { getProviderIcon } from '@/lib/credentials/brand-icons';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const PINNED_STORAGE_KEY = 'workflow-pinned-nodes';
const MAX_PINNED_NODES = 8;

const categoryLabels: Record<NodeCategory, string> = {
  [NodeCategory.TRIGGER]: 'Triggers',
  [NodeCategory.SANDFLARE]: 'Sandflare',
  [NodeCategory.AGENT]: 'Agents',
  [NodeCategory.MEMORY]: 'Memory',
  [NodeCategory.AI]: 'AI & ML',
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
};

const categoryIcons: Record<NodeCategory, keyof typeof LucideIcons> = {
  [NodeCategory.TRIGGER]: 'Zap',
  [NodeCategory.SANDFLARE]: 'Code',
  [NodeCategory.AGENT]: 'Bot',
  [NodeCategory.MEMORY]: 'BrainCircuit',
  [NodeCategory.AI]: 'Brain',
  [NodeCategory.TOOL]: 'Wrench',
  [NodeCategory.ANALYTICS]: 'Activity',
  [NodeCategory.RAG]: 'DatabaseZap',
  [NodeCategory.EMBEDDING]: 'Binary',
  [NodeCategory.VECTORSTORE]: 'Database',
  [NodeCategory.TRANSFORM]: 'Repeat',
  [NodeCategory.CONTROL]: 'GitBranch',
  [NodeCategory.INTEGRATION]: 'Network',
  [NodeCategory.LOADER]: 'FolderInput',
  [NodeCategory.OUTPUT]: 'CheckCircle',
  [NodeCategory.UTILITY]: 'Wrench',
  [NodeCategory.DATA]: 'Database',
};

function loadPinnedNodes() {
  if (typeof window === 'undefined') {
    return [] as NodeType[];
  }

  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) {
      return [] as NodeType[];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is NodeType => typeof value === 'string' && value in nodeRegistry)
      : [];
  } catch {
    return [] as NodeType[];
  }
}

function persistPinnedNodes(pinnedNodes: NodeType[]) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinnedNodes));
  }
}

function PaletteNodeItem({
  nodeType,
  pinned,
  onTogglePin,
  onAddNode,
  onDragStart,
}: {
  nodeType: NodeType;
  pinned: boolean;
  onTogglePin: (nodeType: NodeType) => void;
  onAddNode: (nodeType: NodeType) => void;
  onDragStart: (event: React.DragEvent, nodeType: NodeType) => void;
}) {
  const node = nodeRegistry[nodeType];
  const NodeIcon = (LucideIcons[node.icon as keyof typeof LucideIcons] || LucideIcons.Box) as React.ComponentType<{ className?: string }>;
  const brandIcon = getProviderIcon(
    typeof node.defaultConfig?.provider === 'string' ? node.defaultConfig.provider : null,
    node.brandIcon,
    node.type.split('.').slice(1).join('.'),
    node.type.split('.').at(-1)
  );

  return (
    <div className="group relative ml-6">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onTogglePin(node.type);
        }}
        className={cn(
          'absolute right-2 top-2 z-10 rounded p-1 opacity-0 transition hover:bg-background/80 group-hover:opacity-100',
          pinned && 'opacity-100 text-amber-500'
        )}
        title={pinned ? 'Unpin' : 'Pin to favorites'}
      >
        <Star className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
      </button>
      <div
        draggable
        onDragStart={(event) => onDragStart(event, node.type)}
        onClick={() => onAddNode(node.type)}
        className={cn(
          'cursor-grab rounded-md border border-transparent px-3 py-2 transition-colors hover:border-border hover:bg-accent active:cursor-grabbing',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50'
        )}
        title={node.description}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded"
            style={{
              backgroundColor: `${node.color}20`,
              color: node.color,
            }}
          >
            {brandIcon ? <BrandIcon icon={brandIcon} size={14} branded={false} /> : <NodeIcon className="h-3.5 w-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{node.name}</div>
            <div className="truncate text-xs text-muted-foreground">{node.description}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NodePalette({
  autoFocusSearch = false,
  onNodeAdded,
}: {
  autoFocusSearch?: boolean;
  onNodeAdded?: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<NodeCategory>>(new Set());
  const [pinnedNodes, setPinnedNodes] = useState<NodeType[]>(() => loadPinnedNodes());
  const addNode = useWorkflowStore((state) => state.addNode);
  const { toast } = useToast();

  const toggleCategory = (category: NodeCategory) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  useEffect(() => {
    if (!autoFocusSearch) {
      return;
    }

    window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);
  }, [autoFocusSearch]);

  const handleAddNode = (nodeType: NodeType) => {
    addNode(nodeType, { x: 250, y: 150 });
    onNodeAdded?.();
  };

  const handleTogglePin = (nodeType: NodeType) => {
    setPinnedNodes((current) => {
      if (current.includes(nodeType)) {
        const next = current.filter((item) => item !== nodeType);
        persistPinnedNodes(next);
        return next;
      }

      if (current.length >= MAX_PINNED_NODES) {
        toast({
          title: 'Favorites limit reached',
          description: 'You can pin up to 8 nodes.',
        });
        return current;
      }

      const next = [nodeType, ...current];
      persistPinnedNodes(next);
      return next;
    });
  };

  const filteredNodes = useMemo(() => Object.values(nodeRegistry).filter((node) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      node.name.toLowerCase().includes(query) ||
      node.description.toLowerCase().includes(query) ||
      node.type.toLowerCase().includes(query) ||
      String(node.category).toLowerCase().includes(query)
    );
  }), [searchQuery]);

  const pinnedVisibleNodes = useMemo(
    () => pinnedNodes.filter((nodeType) => filteredNodes.some((node) => node.type === nodeType)),
    [filteredNodes, pinnedNodes]
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

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="mb-3 font-semibold">Nodes</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search nodes or categories..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {pinnedVisibleNodes.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 flex items-center gap-2 px-2 py-1.5 text-sm font-medium">
              <Star className="h-4 w-4 fill-current text-amber-500" />
              <span>Favorites</span>
              <span className="ml-auto text-xs text-muted-foreground">{pinnedVisibleNodes.length}</span>
            </div>
            <div className="space-y-1">
              {pinnedVisibleNodes.map((nodeType) => (
                <PaletteNodeItem
                  key={`favorite-${nodeType}`}
                  nodeType={nodeType}
                  pinned
                  onTogglePin={handleTogglePin}
                  onAddNode={handleAddNode}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>
        )}

        {nodesByCategory.map(({ category, nodes }) => {
          const isExpanded = searchQuery ? true : expandedCategories.has(category);
          const CategoryIcon = LucideIcons[categoryIcons[category]] as React.ComponentType<{ className?: string }>;

          return (
            <div key={category} className="mb-2">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CategoryIcon className="h-4 w-4" />
                <span>{categoryLabels[category]}</span>
                <span className="ml-auto text-xs text-muted-foreground">{nodes.length}</span>
              </button>

              {isExpanded && (
                <div className="mt-1 space-y-1">
                  {nodes.map((node) => (
                    <PaletteNodeItem
                      key={node.type}
                      nodeType={node.type}
                      pinned={pinnedNodes.includes(node.type)}
                      onTogglePin={handleTogglePin}
                      onAddNode={handleAddNode}
                      onDragStart={handleDragStart}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-4 text-xs text-muted-foreground">
        <div>Drag nodes onto the canvas or click to add</div>
        <div className="mt-1 text-[11px] text-zinc-500">Press Space to add node</div>
      </div>
    </div>
  );
}
