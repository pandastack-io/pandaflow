'use client';

import { memo, useEffect, useState, type ComponentProps, type ComponentType } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import * as LucideIcons from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { BrandIcon } from '@/components/ui/brand-icon';
import { getProviderIcon } from '@/lib/credentials/brand-icons';
import { getNodeByType } from '@/lib/nodes/registry';
import { validateNodeConfig } from '@/lib/nodes/validation';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { cn } from '@/lib/utils';
import { AGENT_NODE_TYPES, NodeType, type NodeExecutionOutput, type WorkflowNodeData } from '@/types/nodes';

const DEFAULT_ICON = 'Box';

type RuntimeExecutionState = {
  status: NonNullable<WorkflowNodeData['executionStatus']>;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
};

type RuntimeNodeData = WorkflowNodeData & {
  executionState?: RuntimeExecutionState;
  executionOutput?: NodeExecutionOutput;
  collapsed?: boolean;
};

type PortHandleProps = ComponentProps<typeof Handle> & {
  tooltip: string;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
};

const portTooltipPositions = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
} as const;

function formatDuration(durationMs?: number) {
  if (!durationMs) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
}

function truncatePreview(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(maxLength - 1, 1))}…`;
}

function getPreviewString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getNodeSubtitle(type: string, config: Record<string, any>): string | null {
  if (type === NodeType.AGENT_LLM || type === NodeType.AGENT_REACT || type.startsWith('agent.')) {
    return getPreviewString(config.model) ?? getPreviewString(config.provider);
  }

  switch (type) {
    case NodeType.TRIGGER_SCHEDULE:
      return getPreviewString(config.cron);
    case NodeType.TRIGGER_WEBHOOK:
      return getPreviewString(config.path) ?? getPreviewString(config.method);
    case NodeType.TRIGGER_MANUAL:
      return 'Manual trigger';
    case NodeType.INTEGRATION_HTTP:
      return getPreviewString(config.url)?.slice(0, 35) ? truncatePreview(getPreviewString(config.url)!, 35) : getPreviewString(config.method);
    case NodeType.INTEGRATION_REST: {
      const restUrl = getPreviewString(config.url) ?? getPreviewString(config.baseUrl) ?? getPreviewString(config.endpoint);
      return restUrl ? truncatePreview(restUrl, 35) : getPreviewString(config.method);
    }
    case NodeType.INTEGRATION_SLACK:
      return getPreviewString(config.channel);
    case NodeType.INTEGRATION_EMAIL:
      return getPreviewString(config.to);
    case NodeType.INTEGRATION_POSTGRES:
    case NodeType.INTEGRATION_MYSQL:
      return getPreviewString(config.queryType) ?? 'Database';
    case NodeType.INTEGRATION_MONGODB:
      return getPreviewString(config.queryType) ?? getPreviewString(config.operation) ?? 'Database';
    case NodeType.TRANSFORM_JSON:
      return getPreviewString(config.operation);
    case NodeType.TRANSFORM_FILTER:
      return getPreviewString(config.logic) ?? 'Filter';
    case NodeType.CONTROL_FOREACH:
      return getPreviewString(config.itemsPath) ?? getPreviewString(config.items) ?? getPreviewString(config.iterateOver) ?? 'Iterate array';
    case NodeType.CONTROL_CONDITION:
      return getPreviewString(config.expression) ? truncatePreview(getPreviewString(config.expression)!, 30) : getPreviewString(config.evaluationType);
    case NodeType.OUTPUT_RESPONSE:
      return getPreviewString(config.responseType) ?? 'Response';
    case NodeType.OUTPUT_LOG:
      return getPreviewString(config.level);
    case NodeType.PANDASTACK_SCRAPE:
      return getPreviewString(config.url) ? truncatePreview(getPreviewString(config.url)!, 35) : null;
    case NodeType.PANDASTACK_PYTHON:
    case NodeType.PANDASTACK_NODEJS:
      return 'Code executor';
    case NodeType.MEMORY_AGENT_READ:
    case NodeType.MEMORY_AGENT_WRITE:
      return getPreviewString(config.namespace) ?? 'Memory';
    default:
      if (type.startsWith('rag.')) {
        return (
          getPreviewString(config.operation) ??
          getPreviewString(config.strategy) ??
          getPreviewString(config.source) ??
          getPreviewString(config.backend) ??
          getPreviewString(config.provider) ??
          getPreviewString(config.embeddingModel)
        );
      }

      return null;
  }
}

function PortHandle({ tooltip, tooltipSide = 'top', className, children, ...props }: PortHandleProps) {
  return (
    <Handle {...props} title={tooltip} className={cn('group/port', className)}>
      {children}
      <span
        className={cn(
          'pointer-events-none absolute z-30 hidden whitespace-nowrap rounded-md border border-border bg-popover/95 px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-md group-hover/port:block',
          portTooltipPositions[tooltipSide]
        )}
      >
        {tooltip}
      </span>
    </Handle>
  );
}

export const CustomNode = memo(({ id, data, selected }: NodeProps<WorkflowNodeData>) => {
  const nodeInfo = getNodeByType(data.type);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const duplicateNode = useWorkflowStore((state) => state.duplicateNode);
  const deleteNode = useWorkflowStore((state) => state.deleteNode);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const setOutputPanelNodeId = useWorkflowStore((state) => state.setOutputPanelNodeId);
  const debugPausedAtNode = useWorkflowStore((state) => state.debugPausedAtNode);
  const connectionPreview = useWorkflowStore((state) => state.connectionPreview);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const [isHovered, setIsHovered] = useState(false);
  const [showCompletedBadge, setShowCompletedBadge] = useState(false);
  const runtimeData = data as RuntimeNodeData;
  const executionState = runtimeData.executionState;
  const executionOutput = runtimeData.executionOutput;
  const fallbackStatus = data.status === 'error' ? 'failed' : data.status || 'idle';
  const status = executionState?.status || data.executionStatus || fallbackStatus;
  const durationLabel = formatDuration(executionState?.durationMs);
  const isDebugPaused = debugPausedAtNode === id;
  const isAgentNode = (AGENT_NODE_TYPES as readonly NodeType[]).includes(data.type);
  const collapsed = Boolean(runtimeData.collapsed);

  useEffect(() => {
    if (status !== 'completed') {
      setShowCompletedBadge(false);
      return;
    }

    setShowCompletedBadge(true);
    const timeout = window.setTimeout(() => setShowCompletedBadge(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  if (!nodeInfo) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-destructive">
        <div className="text-sm font-medium">Unknown Node</div>
        <div className="text-xs opacity-80">{data.type}</div>
      </div>
    );
  }

  const iconName = (nodeInfo.icon || DEFAULT_ICON) as keyof typeof LucideIcons;
  const IconComponent = (LucideIcons[iconName] || LucideIcons.Box) as ComponentType<{ className?: string }>;
  const validation = validateNodeConfig(data);
  const hasIssues = !validation.isValid && (validation.missingFields.length > 0 || validation.errors.length > 0);
  const brandIcon = getProviderIcon(
    typeof data.config?.provider === 'string' ? data.config.provider : null,
    nodeInfo.brandIcon,
    nodeInfo.type.split('.').slice(1).join('.'),
    nodeInfo.type.split('.').at(-1)
  );

  const statusDotColors = {
    idle: 'bg-muted-foreground/30',
    pending: 'bg-yellow-500/70 animate-pulse',
    running: 'bg-blue-500 animate-pulse',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  } as const;

  const outputs = (() => {
    if (data.type === NodeType.CONTROL_SWITCH) {
      const configuredCases = Array.isArray(data.config?.cases) ? data.config.cases : [];
      const caseOutputs = configuredCases.map((entry: Record<string, unknown>, index: number) => ({
        name: String(entry?.branchKey || entry?.label || `case_${index + 1}`),
        type: 'any',
      }));
      return [...caseOutputs, { name: 'default', type: 'any' }];
    }
    if (data.type === NodeType.AI_QUESTION_CLASSIFIER) {
      const configuredClasses = Array.isArray(data.config?.classes) ? data.config.classes : [];
      const classOutputs = configuredClasses.map((entry: Record<string, unknown>, index: number) => ({
        name: String(entry?.id || entry?.name || `class_${index + 1}`),
        type: 'object',
      }));
      return [...classOutputs, { name: 'default', type: 'object' }];
    }
    return nodeInfo.outputs;
  })();

  const hasMultipleOutputs = outputs.length > 1;
  const hasDefaultOutputHandle = outputs.some((output) => output.name === 'output');
  const minimumHeight = outputs.length >= 3 ? outputs.length * 28 + 48 : undefined;
  const isConnectionPreviewActive = connectionPreview.active;
  const isCompatibleTarget = isConnectionPreviewActive && connectionPreview.compatibleTargetNodeIds.includes(id);
  const isIncompatibleTarget = isConnectionPreviewActive && !isCompatibleTarget && connectionPreview.sourceNodeId !== id;
  const hasExecutionPreview =
    status === 'completed' &&
    typeof executionOutput !== 'undefined' &&
    (typeof executionOutput.output !== 'undefined' || Boolean(executionOutput.error));
  const subtitle = getNodeSubtitle(data.type, (data.config ?? {}) as Record<string, any>);
  const primaryInputHandle = nodeInfo.inputs[0] ?? { name: 'input', type: 'any', required: false };
  const connectedDependencyNodes = {
    model: edges
      .filter((edge) => edge.target === id && edge.targetHandle === 'model' && edge.data?.isDependency)
      .map((edge) => nodes.find((node) => node.id === edge.source))
      .filter((node): node is typeof nodes[number] => Boolean(node)),
    memory: edges
      .filter((edge) => edge.target === id && edge.targetHandle === 'memory' && edge.data?.isDependency)
      .map((edge) => nodes.find((node) => node.id === edge.source))
      .filter((node): node is typeof nodes[number] => Boolean(node)),
    tool: edges
      .filter((edge) => edge.target === id && edge.targetHandle === 'tool' && edge.data?.isDependency)
      .map((edge) => nodes.find((node) => node.id === edge.source))
      .filter((node): node is typeof nodes[number] => Boolean(node)),
  };

  const handleShowOutput = () => {
    selectNode(id);
    setOutputPanelNodeId(id);
  };

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data.config ?? {}, null, 2));
    } catch {
      // Clipboard access can fail outside secure contexts.
    }
  };

  const handleRunSingleNode = () => {
    window.dispatchEvent(new CustomEvent('run-single-node', { detail: { nodeId: id } }));
  };

  const handleOpenSubNodePalette = (role: 'model' | 'memory' | 'tool') => {
    window.dispatchEvent(new CustomEvent('open-sub-node-palette', { detail: { nodeId: id, role } }));
  };

  const handleSelectDependencyNode = (nodeId: string) => {
    selectNode(nodeId);
    setOutputPanelNodeId(null);
  };

  // Use the node's category color as a visible border unless a status color is active
  const useNodeCategoryColor =
    !['running', 'pending', 'failed'].includes(status) &&
    !(status === 'completed' && showCompletedBadge) &&
    !(status === 'idle' && hasIssues);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group relative overflow-visible border bg-card shadow-sm transition-all duration-300',
        collapsed
          ? 'min-w-[160px] max-w-[160px] rounded-full px-3 py-2'
          : 'min-w-[200px] max-w-[280px] rounded-xl px-3 py-2.5',
        status === 'idle' && hasIssues && 'border-amber-500/60',
        status === 'pending' && 'animate-pulse border-yellow-500/50',
        status === 'running' && 'border-blue-500/60 ring-2 ring-blue-500 ring-offset-2 ring-offset-background',
        status === 'completed' && showCompletedBadge && 'border-green-500/50',
        status === 'failed' && 'border-red-500/50 bg-red-500/5',
        selected && 'outline outline-2 outline-offset-2',
        isDebugPaused && 'animate-pulse ring-2 ring-blue-500 ring-offset-2 ring-offset-background',
        isCompatibleTarget && 'ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-background',
        isIncompatibleTarget && 'opacity-70'
      )}
      style={{
        outlineColor: selected ? nodeInfo.color : undefined,
        borderColor: useNodeCategoryColor ? nodeInfo.color + (selected ? 'cc' : '70') : undefined,
        minHeight: collapsed ? undefined : minimumHeight,
      }}
    >
      {isHovered && (
        <div
          className="nowheel nodrag nopan animate-in fade-in-0 zoom-in-95 absolute left-1/2 top-[-40px] z-50 flex -translate-x-1/2 gap-1 rounded-lg border border-border bg-popover p-1 shadow-xl duration-100"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            title="Copy"
            className="flex h-7 w-7 items-center justify-center rounded-md text-popover-foreground transition-colors hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation();
              void handleCopyConfig();
            }}
          >
            <LucideIcons.Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Duplicate"
            className="flex h-7 w-7 items-center justify-center rounded-md text-popover-foreground transition-colors hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation();
              duplicateNode(id);
            }}
          >
            <LucideIcons.CopyPlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete"
            className="flex h-7 w-7 items-center justify-center rounded-md text-popover-foreground transition-colors hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation();
              deleteNode(id);
            }}
          >
            <LucideIcons.Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Run"
            className="flex h-7 w-7 items-center justify-center rounded-md text-popover-foreground transition-colors hover:bg-accent"
            onClick={(event) => {
              event.stopPropagation();
              handleRunSingleNode();
            }}
          >
            <LucideIcons.Play className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {(nodeInfo.inputs.length > 0 || isAgentNode) && (
        <>
          <PortHandle
            type="target"
            position={Position.Left}
            tooltip={`"${primaryInputHandle.name}" (${primaryInputHandle.type})`}
            tooltipSide="right"
            className={cn(
              '!h-3 !w-3 !border-2 !border-background !transition-all',
              isConnectionPreviewActive && isCompatibleTarget && 'compatible-port !bg-emerald-500 !shadow-[0_0_0_4px_rgba(16,185,129,0.18)]',
              isConnectionPreviewActive && isIncompatibleTarget && '!bg-muted-foreground/50 !opacity-40',
              !isConnectionPreviewActive && '!bg-primary'
            )}
            style={collapsed ? { top: '50%' } : undefined}
          />
          {isConnectionPreviewActive && isCompatibleTarget && (
            <div className="pointer-events-none absolute -left-2 top-1/2 -translate-x-full -translate-y-1/2 rounded-md border border-emerald-500/40 bg-popover/95 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 shadow-lg">
              Drop here to connect
            </div>
          )}
        </>
      )}

      {status === 'running' && (
        <>
          <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-full bg-blue-500 animate-ping" />
          <div className="pointer-events-none absolute -right-1 -top-1 h-3 w-3 rounded-full bg-blue-500" />
        </>
      )}

      {showCompletedBadge && (
        <div className="pointer-events-none absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-green-400/40 bg-green-500 text-white shadow-sm">
          <LucideIcons.Check className="h-3 w-3" />
        </div>
      )}

      {status === 'failed' && (
        <div className="pointer-events-none absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-red-400/40 bg-red-500 text-white shadow-sm">
          <LucideIcons.X className="h-3 w-3" />
        </div>
      )}

      {hasIssues && status === 'idle' && (
        <div className="group absolute -right-2 -top-2 z-10">
          <div className="flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
            <LucideIcons.AlertTriangle className="h-3 w-3" />
          </div>
          <div className="pointer-events-none absolute bottom-6 right-0 z-50 hidden w-48 rounded-lg border border-border bg-popover p-2 text-xs shadow-xl group-hover:block">
            <p className="mb-1 font-semibold text-foreground">Configuration needed:</p>
            {validation.missingFields.map((field) => (
              <div key={field} className="flex items-center gap-1 text-muted-foreground">
                <span className="text-amber-500">•</span>
                <span>{field}</span>
              </div>
            ))}
            {validation.errors.map((error, index) => (
              <div key={`${error}-${index}`} className="flex items-center gap-1 text-red-500">
                <span>•</span>
                <span>{error}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        title={collapsed ? 'Expand node' : 'Collapse node'}
        className="nowheel nodrag nopan absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          updateNodeData(id, { collapsed: !collapsed } as Partial<WorkflowNodeData>);
        }}
      >
        {collapsed ? <LucideIcons.ChevronDown className="h-3.5 w-3.5" /> : <LucideIcons.ChevronUp className="h-3.5 w-3.5" />}
      </button>

      <div className={cn('flex items-center gap-2', collapsed ? 'mb-0 min-h-6' : 'mb-1.5')}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${nodeInfo.color}20`, color: nodeInfo.color }}
        >
          {brandIcon ? <BrandIcon icon={brandIcon} size={16} branded={false} /> : <IconComponent className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{data.config?.label || nodeInfo.name}</div>
          {!collapsed && <div className="truncate text-xs text-muted-foreground">{subtitle ?? nodeInfo.category}</div>}
        </div>
        {!collapsed && <div className={cn('h-2 w-2 rounded-full', statusDotColors[status])} />}
      </div>

      {!collapsed && isAgentNode && (
        <div className="mt-3 border-t border-dashed border-border/70 pt-3">
          <div className="grid grid-cols-3 items-start gap-2">
            {[
              { id: 'model' as const, label: 'Chat Model*', color: 'text-violet-600 dark:text-violet-300', handle: '!bg-violet-500', ring: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-100' },
              { id: 'memory' as const, label: 'Memory', color: 'text-emerald-600 dark:text-emerald-300', handle: '!bg-emerald-500', ring: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100' },
              { id: 'tool' as const, label: connectedDependencyNodes.tool.length > 0 ? `Tool (${connectedDependencyNodes.tool.length})` : 'Tool', color: 'text-amber-600 dark:text-amber-300', handle: '!bg-amber-500', ring: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-100' },
            ].map((slot) => {
              const slotNodes = connectedDependencyNodes[slot.id];
              const hasConnections = slotNodes.length > 0;

              return (
                <div key={slot.id} className="relative flex flex-col items-center gap-2 text-center">
                  <div className={cn('text-[10px] font-semibold uppercase tracking-[0.14em]', slot.color)}>{slot.label}</div>
                  <div className="flex min-h-12 w-full flex-col items-center gap-1">
                    {hasConnections ? (
                      <>
                        {slotNodes.slice(0, slot.id === 'tool' ? 2 : 1).map((slotNode) => (
                          <button
                            key={slotNode.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSelectDependencyNode(slotNode.id);
                            }}
                            className={cn(
                              'nowheel nodrag nopan w-full truncate rounded-md border px-2 py-1 text-[11px] font-medium transition hover:brightness-110',
                              slot.ring
                            )}
                            title={String(slotNode.data.config?.label || getNodeByType(slotNode.data.type)?.name || slotNode.data.type)}
                          >
                            {slotNode.data.config?.label || getNodeByType(slotNode.data.type)?.name || slotNode.data.type}
                          </button>
                        ))}
                        {slot.id === 'tool' && slotNodes.length > 2 && (
                          <div className="text-[10px] text-muted-foreground">+{slotNodes.length - 2} more</div>
                        )}
                        {slot.id === 'tool' && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleOpenSubNodePalette(slot.id);
                            }}
                            className={cn(
                              'nowheel nodrag nopan flex h-7 w-7 items-center justify-center rounded-full border border-dashed bg-background/70 transition hover:bg-background',
                              slot.ring
                            )}
                            title="Attach another tool sub-node"
                          >
                            <LucideIcons.Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenSubNodePalette(slot.id);
                        }}
                        className={cn(
                          'nowheel nodrag nopan flex h-8 w-8 items-center justify-center rounded-full border border-dashed bg-background/70 transition hover:bg-background',
                          slot.ring
                        )}
                        title={`Attach ${slot.label.toLowerCase()} sub-node`}
                      >
                        <LucideIcons.Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <PortHandle
                    type="target"
                    position={Position.Bottom}
                    id={slot.id}
                    tooltip={`"${slot.id}" (dependency)`}
                    tooltipSide="top"
                    className={cn(
                      '!top-auto !h-3 !w-3 !border-2 !border-background !bg-transparent',
                      slot.handle
                    )}
                    style={{
                      left: '50%',
                      bottom: -18,
                      borderRadius: 2,
                      transform: 'translateX(-50%) rotate(45deg)',
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {collapsed && isAgentNode && (
        <div className="absolute inset-x-0 -bottom-3 flex items-center justify-center gap-8">
          {[
            { id: 'model' as const, color: '!bg-violet-500', left: '26%' },
            { id: 'memory' as const, color: '!bg-emerald-500', left: '50%' },
            { id: 'tool' as const, color: '!bg-amber-500', left: '74%' },
          ].map((slot) => (
            <PortHandle
              key={slot.id}
              type="target"
              position={Position.Bottom}
              id={slot.id}
              tooltip={`"${slot.id}" (dependency)`}
              tooltipSide="top"
              className={cn('!top-auto !h-3 !w-3 !border-2 !border-background !bg-transparent', slot.color)}
              style={{ left: slot.left, bottom: -10, borderRadius: 2, transform: 'translateX(-50%) rotate(45deg)' }}
            />
          ))}
        </div>
      )}

      {(executionState?.error || data.error) && status === 'failed' && (
        <div className="group/err absolute -bottom-2 left-1/2 z-20 -translate-x-1/2">
          <div className="absolute bottom-full left-1/2 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-red-500/30 bg-popover p-2 text-[11px] text-red-400 shadow-xl group-hover/err:block">
            <p className="mb-0.5 font-semibold text-red-500">Error</p>
            <p className="break-words leading-snug">{executionState?.error || data.error}</p>
            {durationLabel && <p className="mt-1 text-muted-foreground">{durationLabel}</p>}
          </div>
          <div className="h-1.5 w-8 cursor-help rounded-full bg-red-500/40" />
        </div>
      )}

      {hasExecutionPreview && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleShowOutput();
          }}
          className="group/out absolute -bottom-2 left-1/2 z-20 -translate-x-1/2"
        >
          <div className="flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 transition-colors hover:bg-green-500/20">
            {durationLabel && <span className="text-muted-foreground">{durationLabel}</span>}
            <span>View output</span>
            <ChevronRight className="h-3 w-3 transition-transform group-hover/out:translate-x-0.5" />
          </div>
        </button>
      )}

      {durationLabel && status === 'completed' && !hasExecutionPreview && (
        <div className="absolute -bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {durationLabel}
        </div>
      )}

      {outputs.map((output, index) => (
        <PortHandle
          key={output.name}
          type="source"
          position={Position.Right}
          id={output.name}
          tooltip={`"${output.name}" (${output.type})`}
          tooltipSide="left"
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
          style={{
            top: `${((index + 1) * 100) / (outputs.length + 1)}%`,
          }}
        >
          {!collapsed && hasMultipleOutputs && (
            <span
              className="pointer-events-none absolute left-full top-1/2 ml-1 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold shadow-sm"
              style={{
                background:
                  output.name === 'true'
                    ? 'color-mix(in srgb, var(--color-green-500) 14%, transparent)'
                    : output.name === 'false'
                      ? 'color-mix(in srgb, var(--color-red-500) 14%, transparent)'
                      : output.name === 'default'
                        ? 'color-mix(in srgb, var(--color-amber-500) 14%, transparent)'
                        : 'color-mix(in srgb, var(--color-indigo-500) 14%, transparent)',
                color:
                  output.name === 'true'
                    ? 'var(--color-green-600)'
                    : output.name === 'false'
                      ? 'var(--color-red-600)'
                      : output.name === 'default'
                        ? 'var(--color-amber-600)'
                        : 'var(--color-indigo-500)',
              }}
            >
              {output.name}
            </span>
          )}
        </PortHandle>
      ))}

      {!collapsed && status !== 'running' && hasDefaultOutputHandle && (
        <>
          {/* Invisible bridge keeps the group hovered while cursor travels to the + button */}
          <div className="absolute right-0 top-0 h-full w-16 translate-x-full" />
          <button
            type="button"
            className="nodrag nopan nowheel absolute right-[-44px] top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md transition pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-accent hover:text-primary"
            title="Add connected node"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              window.dispatchEvent(new CustomEvent('node-quick-add', {
                detail: {
                  nodeId: id,
                  handleId: 'output',
                  x: rect.right + 8,
                  y: rect.top + rect.height / 2,
                },
              }));
            }}
          >
            <LucideIcons.Plus className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
