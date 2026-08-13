/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { AlertTriangle, BarChart3, ChevronDown, ChevronRight, Clock3, FileOutput, Loader2, Trash2, X } from 'lucide-react';
import type { Node } from 'reactflow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { BrandIcon } from '@/components/ui/brand-icon';
import { getProviderIcon } from '@/lib/credentials/brand-icons';
import { getNodeByType } from '@/lib/nodes/registry';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { cn } from '@/lib/utils';
import type { NodeRegistryEntry, WorkflowNodeData } from '@/types/nodes';
import { OutputViewer } from './output-viewer';
import { NodeConfigForm } from './node-config-forms';

interface NodeConfigPanelProps {
  hidden?: boolean;
}

interface NodeConfigPanelBodyProps {
  selectedNode: Node<WorkflowNodeData>;
  nodeInfo: NodeRegistryEntry;
}

type ErrorHandlingMode = 'continue' | 'stop' | 'retry' | 'custom_branch';

type ErrorHandlingConfig = {
  onError: ErrorHandlingMode;
  maxRetries?: number;
  retryDelay?: '1s' | '5s' | '30s' | '60s';
};

function normalizeErrorHandling(config: Record<string, any>): ErrorHandlingConfig {
  const errorHandling = config.errorHandling ?? {};
  return {
    onError: errorHandling.onError ?? 'stop',
    maxRetries: typeof errorHandling.maxRetries === 'number' ? errorHandling.maxRetries : 3,
    retryDelay: errorHandling.retryDelay ?? '5s',
  };
}

function stringifyPreview(value: unknown) {
  if (typeof value === 'undefined') return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatDuration(duration?: number) {
  if (!duration) return '—';
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(duration >= 10000 ? 0 : 1)}s`;
}

function ErrorHandlingSection({
  config,
  onChange,
}: {
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}) {
  const [open, setOpen] = useState(false);
  const errorHandling = normalizeErrorHandling(config);

  const applyErrorHandling = (partial: Partial<ErrorHandlingConfig>) => {
    const nextErrorHandling = { ...errorHandling, ...partial };
    const nextConfig: Record<string, any> = {
      ...config,
      errorHandling: nextErrorHandling,
    };

    if (nextErrorHandling.onError === 'retry') {
      const retryDelayMs = {
        '1s': 1000,
        '5s': 5000,
        '30s': 30000,
        '60s': 60000,
      }[nextErrorHandling.retryDelay ?? '5s'];

      nextConfig.retryPolicy = {
        ...(config.retryPolicy ?? {}),
        maxRetries: nextErrorHandling.maxRetries ?? 3,
        backoffMs: retryDelayMs,
      };
    } else if (nextConfig.retryPolicy) {
      delete nextConfig.retryPolicy;
    }

    onChange(nextConfig);
  };

  return (
    <div className="rounded-lg border border-border/60 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Error Handling
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">On Error</label>
            <Select value={errorHandling.onError} onValueChange={(value) => applyErrorHandling({ onError: value as ErrorHandlingMode })}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="continue">Continue</SelectItem>
                <SelectItem value="stop">Stop</SelectItem>
                <SelectItem value="retry">Retry</SelectItem>
                <SelectItem value="custom_branch">Custom Branch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {errorHandling.onError === 'retry' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Max Retries</label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={errorHandling.maxRetries ?? 3}
                  onChange={(event) => applyErrorHandling({ maxRetries: Math.max(0, Math.min(5, Number(event.target.value) || 0)) })}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Retry Delay</label>
                <Select value={errorHandling.retryDelay ?? '5s'} onValueChange={(value) => applyErrorHandling({ retryDelay: value as ErrorHandlingConfig['retryDelay'] })}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1s">1s</SelectItem>
                    <SelectItem value="5s">5s</SelectItem>
                    <SelectItem value="30s">30s</SelectItem>
                    <SelectItem value="60s">60s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {errorHandling.onError === 'custom_branch' && (
            <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-700 dark:text-indigo-200">
              Connect the error output port to handle failures.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LastRunSection({
  summary,
  executionOutput,
  executionId,
}: {
  summary?: {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    error?: string;
    duration?: number;
  };
  executionOutput?: { input?: unknown; output?: unknown; error?: string };
  executionId?: string | null;
}) {
  const [showPreview, setShowPreview] = useState(false);

  if (!summary && !executionOutput) {
    return null;
  }

  const status = summary?.status ?? (executionOutput?.error ? 'failed' : 'completed');
  const statusClassName = {
    pending: 'border-border bg-muted text-muted-foreground',
    running: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    completed: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
    failed: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    cancelled: 'border-border bg-muted text-muted-foreground',
  }[status];

  const inputPreview = stringifyPreview(executionOutput?.input);
  const outputPreview = stringifyPreview(executionOutput?.output);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Last Run</CardTitle>
            <CardDescription className="text-xs">
              {executionId ? `Execution ${executionId.slice(0, 8)}…` : 'Most recent execution details for this node.'}
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn('capitalize', statusClassName)}>
            {status === 'running' ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Clock3 className="mr-1 h-3 w-3" />}
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">Duration: <span className="text-foreground">{formatDuration(summary?.duration)}</span></div>

        <button
          type="button"
          onClick={() => setShowPreview((value) => !value)}
          className="flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/40"
        >
          <span>Input / output preview</span>
          {showPreview ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showPreview && (
          <div className="space-y-3">
            {summary?.error || executionOutput?.error ? (
              <div>
                <div className="mb-1 text-xs font-medium text-red-400">Error</div>
                <Textarea readOnly value={String(summary?.error ?? executionOutput?.error ?? '')} className="min-h-[88px] font-mono text-xs" />
              </div>
            ) : null}
            {inputPreview ? (
              <div>
                <div className="mb-1 text-xs font-medium">Input</div>
                <Textarea readOnly value={inputPreview} className="min-h-[88px] font-mono text-xs" />
              </div>
            ) : null}
            {outputPreview ? (
              <div>
                <div className="mb-1 text-xs font-medium">Output</div>
                <Textarea readOnly value={outputPreview} className="min-h-[120px] font-mono text-xs" />
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NodeConfigPanelBody({ selectedNode, nodeInfo }: NodeConfigPanelBodyProps) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const deleteNode = useWorkflowStore((state) => state.deleteNode);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const setIsPanelOpen = useWorkflowStore((state) => state.setIsPanelOpen);
  const outputPanelNodeId = useWorkflowStore((state) => state.outputPanelNodeId);
  const setOutputPanelNodeId = useWorkflowStore((state) => state.setOutputPanelNodeId);
  const executionOutputs = useWorkflowStore((state) => state.executionOutputs);
  const executionNodeSummaries = useWorkflowStore((state) => state.executionNodeSummaries);
  const activeExecutionId = useWorkflowStore((state) => state.activeExecutionId);
  const [manualTab, setManualTab] = useState<'config' | 'output'>('config');

  const nodeExecutionOutput = executionOutputs[selectedNode.id];
  const hasExecutionData = useMemo(
    () =>
      Boolean(
        nodeExecutionOutput &&
          (typeof nodeExecutionOutput.input !== 'undefined' ||
            typeof nodeExecutionOutput.output !== 'undefined' ||
            nodeExecutionOutput.error)
      ),
    [nodeExecutionOutput]
  );

  const activeTab = outputPanelNodeId === selectedNode.id ? 'output' : manualTab;
  const lastRunSummary = executionNodeSummaries.find((entry) => entry.nodeId === selectedNode.id);
  const NodeIcon = (LucideIcons[nodeInfo.icon as keyof typeof LucideIcons] || LucideIcons.Box) as React.ComponentType<{ className?: string }>;
  const brandIcon = getProviderIcon(
    typeof selectedNode.data.config?.provider === 'string' ? selectedNode.data.config.provider : null,
    nodeInfo.brandIcon,
    nodeInfo.type.split('.').slice(1).join('.'),
    nodeInfo.type.split('.').at(-1)
  );

  const handleLabelChange = (label: string) => {
    updateNodeData(selectedNode.id, {
      config: { ...selectedNode.data.config, label },
    });
  };

  const handleDescriptionChange = (description: string) => {
    updateNodeData(selectedNode.id, {
      config: { ...selectedNode.data.config, description },
    });
  };

  const handleDelete = () => {
    deleteNode(selectedNode.id);
  };

  const handleClose = () => {
    setOutputPanelNodeId(null);
    selectNode(null);
    setIsPanelOpen(false);
  };

  return (
    <div className="flex h-full w-[420px] flex-col border-l border-border bg-card">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${nodeInfo.color}20`, color: nodeInfo.color }}
            >
              {brandIcon ? <BrandIcon icon={brandIcon} size={18} branded={false} /> : <NodeIcon className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{nodeInfo.name}</div>
              <div className="truncate text-xs text-muted-foreground">{nodeInfo.category}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleDelete} title="Delete node" className="h-8 w-8">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {hasExecutionData && (
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const nextValue = value as 'config' | 'output';
              setManualTab(nextValue);
              if (outputPanelNodeId === selectedNode.id) {
                setOutputPanelNodeId(null);
              }
            }}
            className="mt-4"
          >
            <TabsList className="grid h-9 w-full grid-cols-2 bg-muted/60">
              <TabsTrigger value="config" className="gap-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5" />
                Config
              </TabsTrigger>
              <TabsTrigger value="output" className={cn('gap-1.5 text-xs', activeTab === 'output' && 'text-green-600')}>
                <FileOutput className="h-3.5 w-3.5" />
                Output
                {typeof nodeExecutionOutput?.output !== 'undefined' && <span className="text-green-500">●</span>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'output' && hasExecutionData ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Node Output</CardTitle>
                <CardDescription className="text-xs">
                  Inspect the most recent execution payload for this node.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OutputViewer
                  input={nodeExecutionOutput?.input}
                  output={nodeExecutionOutput?.output}
                  error={nodeExecutionOutput?.error}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Basic Information</CardTitle>
                <CardDescription className="text-xs">{nodeInfo.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium">Label</label>
                  <Input
                    value={selectedNode.data.config?.label || ''}
                    onChange={(event) => handleLabelChange(event.target.value)}
                    placeholder={nodeInfo.name}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Description</label>
                  <Input
                    value={selectedNode.data.config?.description || ''}
                    onChange={(event) => handleDescriptionChange(event.target.value)}
                    placeholder="Optional description"
                    className="h-8 text-sm"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Configuration</CardTitle>
                <CardDescription className="text-xs">Node-specific settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <NodeConfigForm
                  nodeType={selectedNode.data.type}
                  nodeId={selectedNode.id}
                  config={selectedNode.data.config}
                  onChange={(newConfig) => {
                    updateNodeData(selectedNode.id, { config: newConfig });
                  }}
                />
                <ErrorHandlingSection
                  config={selectedNode.data.config ?? {}}
                  onChange={(newConfig) => {
                    updateNodeData(selectedNode.id, { config: newConfig });
                  }}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Inputs & Outputs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {nodeInfo.inputs.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-medium">Inputs</div>
                    <div className="space-y-1">
                      {nodeInfo.inputs.map((input) => (
                        <div
                          key={input.name}
                          className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-xs"
                        >
                          <span>{input.name}</span>
                          <span className="text-muted-foreground">{input.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {nodeInfo.outputs.length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-medium">Outputs</div>
                    <div className="space-y-1">
                      {nodeInfo.outputs.map((output) => (
                        <div
                          key={output.name}
                          className="flex items-center justify-between rounded-md bg-muted px-2 py-1 text-xs"
                        >
                          <span>{output.name}</span>
                          <span className="text-muted-foreground">{output.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Debug Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-xs">
                  <div>
                    <span className="font-medium">Node ID:</span>{' '}
                    <span className="text-muted-foreground">{selectedNode.id}</span>
                  </div>
                  <div>
                    <span className="font-medium">Type:</span>{' '}
                    <span className="text-muted-foreground">{selectedNode.data.type}</span>
                  </div>
                  <div>
                    <span className="font-medium">Status:</span>{' '}
                    <span className="text-muted-foreground">{selectedNode.data.status}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <LastRunSection
              summary={lastRunSummary}
              executionOutput={nodeExecutionOutput}
              executionId={activeExecutionId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function NodeConfigPanel({ hidden = false }: NodeConfigPanelProps) {
  const selectedNode = useWorkflowStore((state) => state.selectedNode);
  const isPanelOpen = useWorkflowStore((state) => state.isPanelOpen);

  if (hidden || !isPanelOpen || !selectedNode) {
    return null;
  }

  const nodeInfo = getNodeByType(selectedNode.data.type);
  if (!nodeInfo) {
    return null;
  }

  return <NodeConfigPanelBody key={selectedNode.id} selectedNode={selectedNode} nodeInfo={nodeInfo} />;
}
