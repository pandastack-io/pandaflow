'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, ExternalLink, Loader2, MessageSquareText, Play, Save, Settings } from 'lucide-react';
import { ExecutionResultsPanel } from '@/components/workflow/execution-results-panel';
import { ExecutionStatusBar } from '@/components/workflow/execution-status-bar';
import { WorkflowCanvasNew } from '@/components/workflow/workflow-canvas-new';
import { WorkflowTypeSelector } from '@/components/workflow/workflow-type-selector';
import { WorkflowVariablesPanel } from '@/components/workflow/workflow-variables-panel';
import { ChatSettingsDialog } from '@/components/workflow/chat-settings-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useExecutionStream } from '@/hooks/use-execution-stream';
import type { ChatSettings, WorkflowType } from '@/lib/chat';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { cn } from '@/lib/utils';
import { NodeCategory, NodeType, type NodeExecutionOutput } from '@/types/nodes';

type NodeExecutionState = {
  nodeId: string;
  nodeName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: unknown;
  output?: unknown;
  error?: string;
  duration?: number;
  timestamp?: string;
};

type ExecutionState = {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  nodeExecutions: NodeExecutionState[];
  error?: unknown;
  output?: unknown;
};

function getExecutionDurationMs(
  execution: ExecutionState | null,
  nodeStates: ReturnType<typeof useExecutionStream>['nodeStates']
) {
  if (execution?.duration) {
    return execution.duration;
  }

  const timestamps = Object.values(nodeStates).flatMap((state) =>
    [state.startedAt, state.completedAt].filter((value): value is number => typeof value === 'number')
  );

  if (timestamps.length < 2) {
    return undefined;
  }

  return Math.max(...timestamps) - Math.min(...timestamps);
}

export default function NewWorkflowPage() {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [workflowType, setWorkflowType] = useState<WorkflowType>('automation');
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  const [currentExecution, setCurrentExecution] = useState<ExecutionState | null>(null);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null);
  const [chatPublicId, setChatPublicId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [dismissedExecutionId, setDismissedExecutionId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoOpenedExecutionIdRef = useRef<string | null>(null);

  const workflowName = useWorkflowStore((state) => state.workflowName);
  const workflowDescription = useWorkflowStore((state) => state.workflowDescription);
  const workflowVariables = useWorkflowStore((state) => state.workflowVariables);
  const workflowEnvVars = useWorkflowStore((state) => state.workflowEnvVars);
  const totalNodes = useWorkflowStore((state) => state.nodes.length);
  const nodes = useWorkflowStore((state) => state.nodes);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const setWorkflowVariables = useWorkflowStore((state) => state.setWorkflowVariables);
  const setWorkflowEnvVars = useWorkflowStore((state) => state.setWorkflowEnvVars);
  const getWorkflowDefinition = useWorkflowStore((state) => state.getWorkflowDefinition);
  const addNode = useWorkflowStore((state) => state.addNode);
  const setNodes = useWorkflowStore((state) => state.setNodes);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const outputPanelNodeId = useWorkflowStore((state) => state.outputPanelNodeId);
  const setOutputPanelNodeId = useWorkflowStore((state) => state.setOutputPanelNodeId);
  const setExecutionOutputs = useWorkflowStore((state) => state.setExecutionOutputs);
  const clearExecutionOutputs = useWorkflowStore((state) => state.clearExecutionOutputs);

  useEffect(() => {
    if (nodes.length > 0) return;

    if (workflowType === 'automation') {
      addNode(NodeType.TRIGGER_MANUAL, { x: 300, y: 220 });
    } else if (workflowType === 'chat') {
      addNode(NodeType.AI_CHAT, { x: 300, y: 220 });
    } else if (workflowType === 'agent') {
      const triggerId = `node-${Date.now()}-trigger`;
      const agentId = `node-${Date.now()}-agent`;
      const memoryId = `node-${Date.now()}-memory`;

      setNodes([
        {
          id: triggerId,
          type: 'custom',
          position: { x: 80, y: 220 },
          data: { type: NodeType.TRIGGER_MANUAL, category: NodeCategory.TRIGGER, config: {}, status: 'idle' },
        },
        {
          id: agentId,
          type: 'custom',
          position: { x: 360, y: 220 },
          data: {
            type: NodeType.AGENT_LLM,
            category: NodeCategory.AGENT,
            config: {
              provider: 'openai',
              model: 'gpt-4o',
              systemPrompt: 'You are a helpful AI assistant.',
              temperature: 0.7,
            },
            status: 'idle',
          },
        },
        {
          id: memoryId,
          type: 'custom',
          position: { x: 640, y: 220 },
          data: { type: NodeType.MEMORY_BUFFER, category: NodeCategory.MEMORY, config: { maxMessages: 10 }, status: 'idle' },
        },
      ]);
      setEdges([
        { id: `e-${triggerId}-${agentId}`, source: triggerId, target: agentId, type: 'smoothstep' },
        { id: `e-${agentId}-${memoryId}`, source: agentId, target: memoryId, type: 'smoothstep' },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowType]);

  const {
    nodeStates,
    nodeOutputs: streamedNodeOutputs,
    executionStatus,
    reset: resetExecutionStream,
  } = useExecutionStream(activeExecutionId);
  const liveExecutionStatus = activeExecutionId && executionStatus === 'idle' ? 'running' : executionStatus;
  const displayExecution =
    activeExecutionId && currentExecution?.id === activeExecutionId && liveExecutionStatus !== 'idle'
      ? { ...currentExecution, status: liveExecutionStatus }
      : currentExecution;

  const executionOutputs = useMemo(() => {
    const map: Record<string, NodeExecutionOutput> = { ...streamedNodeOutputs };
    for (const nodeExecution of currentExecution?.nodeExecutions ?? []) {
      map[nodeExecution.nodeId] = {
        ...map[nodeExecution.nodeId],
        input: nodeExecution.input,
        output: nodeExecution.output ?? map[nodeExecution.nodeId]?.output,
        error: nodeExecution.error ?? map[nodeExecution.nodeId]?.error,
      };
    }
    return map;
  }, [currentExecution, streamedNodeOutputs]);

  const statusBarVisible = Boolean(activeExecutionId) && dismissedExecutionId !== activeExecutionId && liveExecutionStatus !== 'idle';

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  useEffect(() => {
    setExecutionOutputs(executionOutputs);
  }, [executionOutputs, setExecutionOutputs]);

  useEffect(() => {
    if (!outputPanelNodeId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setShowResults(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [outputPanelNodeId]);

  useEffect(() => {
    if (!activeExecutionId || liveExecutionStatus !== 'completed') {
      return;
    }

    const timeout = window.setTimeout(() => {
      setDismissedExecutionId((current) => (current === activeExecutionId ? current : activeExecutionId));
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [activeExecutionId, liveExecutionStatus]);

  useEffect(() => {
    if (
      liveExecutionStatus !== 'completed' ||
      !currentExecution ||
      !activeExecutionId ||
      currentExecution.id !== activeExecutionId ||
      autoOpenedExecutionIdRef.current === activeExecutionId
    ) {
      return;
    }

    autoOpenedExecutionIdRef.current = activeExecutionId;

    const lastCompleted =
      [...currentExecution.nodeExecutions].reverse().find((nodeExecution) => nodeExecution.status === 'completed') ??
      [...currentExecution.nodeExecutions].reverse().find((nodeExecution) => nodeExecution.status === 'failed');

    if (lastCompleted) {
      selectNode(lastCompleted.nodeId);
      setOutputPanelNodeId(lastCompleted.nodeId);
    }
  }, [activeExecutionId, currentExecution, liveExecutionStatus, selectNode, setOutputPanelNodeId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const definition = getWorkflowDefinition();

      if (definition.nodes.length === 0 && workflowType !== 'chat') {
        toast({
          title: 'Cannot save empty workflow',
          description: 'Automation and agent flows need at least one node before saving.',
          variant: 'destructive',
        });
        return null;
      }

      const response = await fetch(
        currentWorkflowId ? `/api/workflows/${currentWorkflowId}` : '/api/workflows',
        {
          method: currentWorkflowId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: workflowName,
            description: workflowDescription,
            definition,
            workflowType,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        setCurrentWorkflowId(data.data.id);
        setWorkflowType(data.data.workflowType ?? workflowType);
        toast({
          title: 'Workflow saved',
          description: `“${workflowName}” is ready to build on.`,
        });
        return data.data.id as string;
      }

      throw new Error(data.error);
    } catch (error) {
      toast({
        title: 'Failed to save workflow',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const pollExecutionStatus = useCallback(async (executionId: string) => {
    clearPoll();
    const maxAttempts = 60;
    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts += 1;

      try {
        const response = await fetch(`/api/executions/${executionId}`);
        const data = await response.json();

        if (data.success) {
          const execution = data.data;

          setCurrentExecution({
            id: execution.id,
            status: execution.status,
            startedAt: execution.startedAt,
            completedAt: execution.completedAt,
            duration: execution.durationMs,
            nodeExecutions: execution.nodeExecutions || [],
            error: execution.error,
            output: execution.output,
          });

          if (execution.status === 'completed' || execution.status === 'failed' || execution.status === 'cancelled') {
            clearPoll();
            setRunning(false);
          }
        }

        if (attempts >= maxAttempts) {
          clearPoll();
          setRunning(false);
          toast({
            title: 'Execution timeout',
            description: 'Workflow is still running. Check back later for results.',
          });
        }
      } catch {
        clearPoll();
        setRunning(false);
      }
    }, 1000);
  }, [clearPoll, toast]);

  const handleRun = async () => {
    setRunning(true);
    clearExecutionOutputs();
    setCurrentExecution(null);
    setShowResults(false);
    setOutputPanelNodeId(null);
    autoOpenedExecutionIdRef.current = null;

    try {
      const workflowIdToRun = currentWorkflowId || await handleSave();
      if (!workflowIdToRun) {
        throw new Error('Please save the workflow first');
      }

      const response = await fetch(`/api/workflows/${workflowIdToRun}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {} }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setCurrentExecution({
        id: data.data.executionId,
        status: 'running',
        nodeExecutions: [],
      });
      setActiveExecutionId(data.data.executionId);
      setDismissedExecutionId(null);

      await pollExecutionStatus(data.data.executionId);
    } catch (error) {
      toast({
        title: 'Failed to run workflow',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setRunning(false);
    }
  };

  const handleStopTracking = useCallback(() => {
    clearPoll();
    resetExecutionStream();
    setRunning(false);
    setShowResults(false);
    if (activeExecutionId) {
      setDismissedExecutionId(activeExecutionId);
    }
    setActiveExecutionId(null);
  }, [activeExecutionId, clearPoll, resetExecutionStream]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center space-x-4">
          <Link href="/workflows">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              placeholder="Untitled Workflow"
              className="min-w-[220px] border-none bg-transparent text-lg font-semibold focus:outline-none focus:ring-0"
            />
            <Badge variant="outline" className="capitalize">{workflowType}</Badge>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => setShowWorkflowSettings(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          {workflowType === 'chat' && (
            <Button variant="outline" size="sm" onClick={() => setShowChatSettings(true)}>
              <MessageSquareText className="mr-2 h-4 w-4" />
              Publish Chat
            </Button>
          )}
          {workflowType === 'agent' && (
            <Button variant="outline" size="sm" onClick={() => setShowWorkflowSettings(true)}>
              <Bot className="mr-2 h-4 w-4" />
              Agent Config
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {workflowType === 'chat' ? (
            <Button size="sm" onClick={async () => {
              const id = currentWorkflowId || await handleSave();
              if (id && chatPublicId) window.open(`/chat/${chatPublicId}`, '_blank');
              else if (id) setShowChatSettings(true);
            }} disabled={saving}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview Chat
            </Button>
          ) : (
            <Button size="sm" onClick={handleRun} disabled={running}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {running ? 'Running...' : 'Run'}
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-border bg-card/60 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Choose your flow type</p>
            <p className="text-sm text-muted-foreground">Start with automation, launch a shareable chat assistant, or design a tool-using AI agent.</p>
          </div>
          <WorkflowTypeSelector value={workflowType} onChange={setWorkflowType} />
        </div>
      </div>

      <div className={cn('min-h-0 flex-1', statusBarVisible && 'pb-12')}>
        <WorkflowCanvasNew
          executionId={activeExecutionId}
          executionNodeStates={nodeStates}
          executionOutputs={executionOutputs}
          hideConfigPanel={showResults}
        />
      </div>

      <ExecutionStatusBar
        executionStatus={liveExecutionStatus}
        nodeStates={nodeStates}
        nodeIds={nodes.map((node) => node.id)}
        totalNodes={totalNodes}
        durationMs={getExecutionDurationMs(displayExecution, nodeStates)}
        visible={statusBarVisible}
        onViewLogs={() => setShowResults(true)}
        onStop={handleStopTracking}
        onDismiss={() => setDismissedExecutionId(activeExecutionId)}
      />

      <Dialog open={showWorkflowSettings} onOpenChange={setShowWorkflowSettings}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Workflow Variables & Environment</DialogTitle>
            <DialogDescription>
              Configure reusable workflow variables and sandbox environment variables.
            </DialogDescription>
          </DialogHeader>
          <WorkflowVariablesPanel
            variables={workflowVariables}
            envVars={workflowEnvVars}
            onChange={(variables, envVars) => {
              setWorkflowVariables(variables);
              setWorkflowEnvVars(envVars);
            }}
          />
        </DialogContent>
      </Dialog>

      <ExecutionResultsPanel
        execution={displayExecution}
        isOpen={showResults}
        onClose={() => setShowResults(false)}
      />

      {currentWorkflowId && (
        <ChatSettingsDialog
          workflowId={currentWorkflowId}
          workflowName={workflowName}
          open={showChatSettings}
          onOpenChange={setShowChatSettings}
          workflowType={workflowType}
          chatSettings={chatSettings}
          isPublic={isPublic}
          chatPublicId={chatPublicId}
          onSaved={({ workflowType: nextType, chatSettings: nextSettings, isPublic: nextIsPublic, chatPublicId: nextChatPublicId }) => {
            setWorkflowType(nextType);
            setChatSettings(nextSettings);
            setIsPublic(nextIsPublic);
            setChatPublicId(nextChatPublicId);
          }}
        />
      )}
    </div>
  );
}
