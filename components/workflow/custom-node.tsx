'use client';

import { memo, useEffect, useState, type ComponentType } from 'react';
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
};

function formatDuration(durationMs?: number) {
  if (!durationMs) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs >= 10000 ? 0 : 1)}s`;
}

export const CustomNode = memo(({ id, data, selected }: NodeProps<WorkflowNodeData>) => {
  const nodeInfo = getNodeByType(data.type);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const duplicateNode = useWorkflowStore((state) => state.duplicateNode);
  const deleteNode = useWorkflowStore((state) => state.deleteNode);
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
  const minimumHeight = outputs.length >= 3 ? outputs.length * 28 + 48 : undefined;
  const isConnectionPreviewActive = connectionPreview.active;
  const isCompatibleTarget = isConnectionPreviewActive && connectionPreview.compatibleTargetNodeIds.includes(id);
  const isIncompatibleTarget = isConnectionPreviewActive && !isCompatibleTarget && connectionPreview.sourceNodeId !== id;
  const hasExecutionPreview =
    status === 'completed' &&
    typeof executionOutput !== 'undefined' &&
    (typeof executionOutput.output !== 'undefined' || Boolean(executionOutput.error));
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

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'relative min-w-[200px] max-w-[280px] overflow-visible rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-all duration-300',
        status === 'idle' && hasIssues && 'border-amber-500/60',
        status === 'pending' && 'animate-pulse border-yellow-500/50',
        status === 'running' && 'border-blue-500/60 ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-900',
        status === 'completed' && showCompletedBadge && 'border-green-500/50',
        status === 'failed' && 'border-red-500/50 bg-red-500/5',
        !hasIssues && status === 'idle' && 'border-border',
        selected && 'outline outline-2 outline-offset-2',
        isDebugPaused && 'animate-pulse ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-900',
        isCompatibleTarget && 'ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-zinc-900',
        isIncompatibleTarget && 'opacity-70'
      )}
      style={{
        outlineColor: selected ? nodeInfo.color : undefined,
        minHeight: minimumHeight,
      }}
    >
      {isHovered && (
        <div
          className="nowheel nodrag nopan animate-in fade-in-0 zoom-in-95 absolute left-1/2 top-[-40px] z-50 flex -translate-x-1/2 gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-1 shadow-xl duration-100"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            title="Copy"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-100 transition-colors hover:bg-zinc-800"
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-100 transition-colors hover:bg-zinc-800"
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-100 transition-colors hover:bg-zinc-800"
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
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-100 transition-colors hover:bg-zinc-800"
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
          <Handle
            type="target"
            position={Position.Left}
            className={cn(
              '!h-3 !w-3 !border-2 !border-background !transition-all',
              isConnectionPreviewActive && isCompatibleTarget && 'compatible-port !bg-emerald-500 !shadow-[0_0_0_4px_rgba(16,185,129,0.18)]',
              isConnectionPreviewActive && isIncompatibleTarget && '!bg-zinc-600/50 !opacity-40',
              !isConnectionPreviewActive && '!bg-primary'
            )}
          />
          {isConnectionPreviewActive && isCompatibleTarget && (
            <div className="pointer-events-none absolute -left-2 top-1/2 -translate-x-full -translate-y-1/2 rounded-md border border-emerald-500/40 bg-zinc-900/95 px-2 py-1 text-[10px] font-medium text-emerald-300 shadow-lg">
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
          <div className="absolute right-0 top-6 z-50 hidden w-48 rounded-lg border border-border bg-popover p-2 text-xs shadow-xl group-hover:block">
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

      <div className="mb-1.5 flex items-center gap-2">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${nodeInfo.color}20`, color: nodeInfo.color }}
        >
          {brandIcon ? <BrandIcon icon={brandIcon} size={16} branded={false} /> : <IconComponent className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{data.config?.label || nodeInfo.name}</div>
          <div className="truncate text-xs text-muted-foreground">{nodeInfo.category}</div>
        </div>
        <div className={cn('h-2 w-2 rounded-full', statusDotColors[status])} />
      </div>

      {isAgentNode && (
        <div className="mt-3 border-t border-dashed border-border/70 pt-3">
          <div className="grid grid-cols-3 items-start gap-2">
            {[
              { id: 'model' as const, label: 'Chat Model*', color: 'text-violet-300', handle: '!bg-violet-500', ring: 'border-violet-500/40 bg-violet-500/10 text-violet-100' },
              { id: 'memory' as const, label: 'Memory', color: 'text-emerald-300', handle: '!bg-emerald-500', ring: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' },
              { id: 'tool' as const, label: connectedDependencyNodes.tool.length > 0 ? `Tool (${connectedDependencyNodes.tool.length})` : 'Tool', color: 'text-amber-300', handle: '!bg-amber-500', ring: 'border-amber-500/40 bg-amber-500/10 text-amber-100' },
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
                  <Handle
                    type="target"
                    position={Position.Bottom}
                    id={slot.id}
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
        <Handle
          key={output.name}
          type="source"
          position={Position.Right}
          id={output.name}
          className="!h-3 !w-3 !border-2 !border-background !bg-primary"
          style={{
            top: `${((index + 1) * 100) / (outputs.length + 1)}%`,
          }}
        >
          {hasMultipleOutputs && (
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
        </Handle>
      ))}
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
