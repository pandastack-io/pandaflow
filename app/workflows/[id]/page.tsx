'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  Bug,
  CheckCircle2,
  Download,
  History,
  Keyboard,
  Loader2,
  MessageSquareText,
  Play,
  Plus,
  Save,
  Settings,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import { ApprovalBanner, type PendingApproval } from '@/components/executions/approval-banner';
import { CostDashboard } from '@/components/agents/cost-dashboard';
import { ChatSettingsDialog } from '@/components/workflow/chat-settings-dialog';
import { ExecutionResultsPanel } from '@/components/workflow/execution-results-panel';
import { ExecutionStatusBar } from '@/components/workflow/execution-status-bar';
import { GenerateWorkflowDialog } from '@/components/workflow/generate-workflow-dialog';
import { useKeyboardShortcuts } from '@/components/workflow/use-keyboard-shortcuts';
import { WorkflowCanvasNew } from '@/components/workflow/workflow-canvas-new';
import { WorkflowVariablesPanel } from '@/components/workflow/workflow-variables-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useExecutionStream } from '@/hooks/use-execution-stream';
import type { ChatSettings, WorkflowType } from '@/lib/chat';
import { getTagColorClasses, getWorkflowExportFilename } from '@/lib/workflow-utils';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { cn } from '@/lib/utils';
import { validateWorkflow, type ValidationIssue } from '@/lib/workflow/validation';
import type { NodeExecutionOutput } from '@/types/nodes';

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

export default function EditWorkflowPage() {
  const router = useRouter();
  const params = useParams();
  const workflowId = params.id as string;
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workflowType, setWorkflowType] = useState<WorkflowType>('automation');
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null);
  const [chatPublicId, setChatPublicId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [currentExecution, setCurrentExecution] = useState<ExecutionState | null>(null);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showDeployAgentDialog, setShowDeployAgentDialog] = useState(false);
  const [deployingAgent, setDeployingAgent] = useState(false);
  const [agentDeployName, setAgentDeployName] = useState('');
  const [agentDeployDescription, setAgentDeployDescription] = useState('');
  const [dismissedExecutionId, setDismissedExecutionId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [debugActionPending, setDebugActionPending] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoOpenedExecutionIdRef = useRef<string | null>(null);
  const fitCanvasRef = useRef<(() => void) | null>(null);

  const workflowName = useWorkflowStore((state) => state.workflowName);
  const workflowDescription = useWorkflowStore((state) => state.workflowDescription);
  const workflowVariables = useWorkflowStore((state) => state.workflowVariables);
  const workflowEnvVars = useWorkflowStore((state) => state.workflowEnvVars);
  const totalNodes = useWorkflowStore((state) => state.nodes.length);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const setWorkflowDescription = useWorkflowStore((state) => state.setWorkflowDescription);
  const setWorkflowVariables = useWorkflowStore((state) => state.setWorkflowVariables);
  const setWorkflowEnvVars = useWorkflowStore((state) => state.setWorkflowEnvVars);
  const getWorkflowDefinition = useWorkflowStore((state) => state.getWorkflowDefinition);
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const setIsPanelOpen = useWorkflowStore((state) => state.setIsPanelOpen);
  const outputPanelNodeId = useWorkflowStore((state) => state.outputPanelNodeId);
  const setOutputPanelNodeId = useWorkflowStore((state) => state.setOutputPanelNodeId);
  const setExecutionOutputs = useWorkflowStore((state) => state.setExecutionOutputs);
  const clearExecutionOutputs = useWorkflowStore((state) => state.clearExecutionOutputs);
  const debugMode = useWorkflowStore((state) => state.debugMode);
  const debugPausedAtNode = useWorkflowStore((state) => state.debugPausedAtNode);
  const setDebugMode = useWorkflowStore((state) => state.setDebugMode);
  const setDebugPausedAtNode = useWorkflowStore((state) => state.setDebugPausedAtNode);
  const deleteSelectedElements = useWorkflowStore((state) => state.deleteSelectedElements);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);

  const {
    nodeStates,
    nodeOutputs: streamedNodeOutputs,
    executionStatus,
    debugPausedNodeId,
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

  const validationIssues = useMemo(() => validateWorkflow(nodes, edges), [edges, nodes]);
  const hasBlockingValidationIssues = validationIssues.some((issue) => issue.severity === 'error');
  const statusBarVisible =
    Boolean(activeExecutionId) && dismissedExecutionId !== activeExecutionId && liveExecutionStatus !== 'idle';
  const isMacPlatform = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const shortcutModifierLabel = isMacPlatform ? '⌘' : 'Ctrl';
  const shortcutRows = useMemo(
    () => [
      { description: 'Save workflow', keys: [shortcutModifierLabel, 'S'] },
      { description: 'Run workflow', keys: [shortcutModifierLabel, 'Enter'] },
      { description: 'Undo', keys: [shortcutModifierLabel, 'Z'] },
      { description: 'Redo', keys: isMacPlatform ? ['⌘', 'Shift', 'Z'] : ['Ctrl', 'Y'] },
      { description: 'Delete selection', keys: ['Delete / Backspace'] },
      { description: 'Deselect and close panel', keys: ['Esc'] },
      { description: 'Show shortcuts', keys: ['?'] },
    ],
    [isMacPlatform, shortcutModifierLabel]
  );

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchPendingApproval = useCallback(async (executionId: string) => {
    try {
      const response = await fetch(`/api/executions/${executionId}/pending`);
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load pending approvals');
      }

      setPendingApproval(payload.data ?? null);
    } catch {
      setPendingApproval(null);
    }
  }, []);

  useEffect(() => () => clearPoll(), [clearPoll]);

  useEffect(() => {
    setExecutionOutputs(executionOutputs);
  }, [executionOutputs, setExecutionOutputs]);

  useEffect(() => {
    if (!activeExecutionId || liveExecutionStatus !== 'running') {
      return;
    }

    let cancelled = false;

    const syncPendingApproval = async () => {
      try {
        const response = await fetch(`/api/executions/${activeExecutionId}/pending`);
        const payload = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok || !payload.success) {
          setPendingApproval(null);
          return;
        }

        setPendingApproval(payload.data ?? null);
      } catch {
        if (!cancelled) {
          setPendingApproval(null);
        }
      }
    };

    void syncPendingApproval();
    const interval = window.setInterval(() => {
      void syncPendingApproval();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeExecutionId, liveExecutionStatus]);

  useEffect(() => {
    setDebugPausedAtNode(debugPausedNodeId);
    if (debugPausedNodeId) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setDebugActionPending(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [debugPausedNodeId, setDebugPausedAtNode]);

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
    const fetchWorkflow = async () => {
      try {
        const response = await fetch(`/api/workflows/${workflowId}`);
        const data = await response.json();

        if (data.success) {
          const workflow = data.data;
          loadWorkflow(workflow.definition);
          setWorkflowName(workflow.name);
          setWorkflowDescription(workflow.description || '');
          setWorkflowType(workflow.workflowType || 'automation');
          setChatSettings((workflow.chatSettings as ChatSettings | null) || null);
          setChatPublicId(workflow.chatPublicId || null);
          setIsPublic(Boolean(workflow.isPublic));
          setTags(workflow.tags || []);
          setAgentDeployName(workflow.name || '');
          setAgentDeployDescription(workflow.description || '');
        } else {
          throw new Error(data.error);
        }
      } catch (error) {
        toast({
          title: 'Failed to load workflow',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
        router.push('/workflows');
      } finally {
        setLoading(false);
      }
    };

    void fetchWorkflow();
  }, [workflowId, router, toast, setWorkflowName, setWorkflowDescription, loadWorkflow]);

  useEffect(() => {
    if (!activeExecutionId || (liveExecutionStatus !== 'completed' && liveExecutionStatus !== 'cancelled')) {
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

  const buildDefinition = useCallback(() => {
    const definition = getWorkflowDefinition();
    return {
      ...definition,
      metadata: {
        ...definition.metadata,
        name: workflowName,
        description: workflowDescription,
        tags,
      },
    };
  }, [getWorkflowDefinition, tags, workflowDescription, workflowName]);

  const handleExport = useCallback(() => {
    try {
      const payload = {
        version: '1.0',
        name: workflowName,
        description: workflowDescription,
        tags,
        definition: buildDefinition(),
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = getWorkflowExportFilename(workflowName);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [buildDefinition, tags, toast, workflowDescription, workflowName]);

  const addTag = useCallback(() => {
    const nextTag = tagDraft.trim();
    if (!nextTag) {
      setTagDraft('');
      setShowTagInput(false);
      return;
    }

    setTags((current) => (current.includes(nextTag) ? current : [...current, nextTag]));
    setTagDraft('');
    setShowTagInput(false);
  }, [tagDraft]);

  const handleSave = useCallback(async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      const definition = buildDefinition();

      if (definition.nodes.length === 0 && workflowType !== 'chat') {
        toast({
          title: 'Cannot save empty workflow',
          description: 'Automation and agent flows need at least one node before saving.',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workflowName,
          description: workflowDescription,
          definition,
          workflowType,
          chatSettings,
          isPublic,
          chatPublicId,
          tags,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setWorkflowType(data.data.workflowType || workflowType);
        setChatSettings((data.data.chatSettings as ChatSettings | null) || null);
        setChatPublicId(data.data.chatPublicId || null);
        setIsPublic(Boolean(data.data.isPublic));
        setTags(data.data.tags || tags);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: 'Failed to save workflow',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [
    buildDefinition,
    chatPublicId,
    chatSettings,
    isPublic,
    saving,
    tags,
    toast,
    workflowDescription,
    workflowId,
    workflowName,
    workflowType,
  ]);

  const handleDeployAgent = useCallback(async () => {
    if (deployingAgent) {
      return;
    }

    setDeployingAgent(true);
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId,
          name: agentDeployName.trim() || workflowName,
          description: agentDeployDescription.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to deploy agent');
      }

      setShowDeployAgentDialog(false);
      toast({
        title: 'Agent deployed',
        description: 'This workflow now has a persistent identity and lifecycle controls.',
        action: (
          <Link href={`/agents/${data.data.id}`} className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium">
            View agent
          </Link>
        ),
      });
    } catch (error) {
      toast({
        title: 'Failed to deploy agent',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDeployingAgent(false);
    }
  }, [agentDeployDescription, agentDeployName, deployingAgent, toast, workflowId, workflowName]);

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

  const executeWorkflow = useCallback(async () => {
    if (running) {
      return;
    }

    setRunning(true);
    clearExecutionOutputs();
    setCurrentExecution(null);
    setPendingApproval(null);
    setShowResults(false);
    setOutputPanelNodeId(null);
    setDebugPausedAtNode(null);
    setDebugActionPending(false);
    autoOpenedExecutionIdRef.current = null;

    try {
      const response = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: {}, debug: debugMode }),
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
  }, [clearExecutionOutputs, debugMode, pollExecutionStatus, running, setDebugPausedAtNode, setOutputPanelNodeId, toast, workflowId]);

  const handleRun = useCallback(() => {
    if (running) {
      return;
    }

    if (validationIssues.length > 0) {
      setShowValidationDialog(true);
      return;
    }

    void executeWorkflow();
  }, [executeWorkflow, running, validationIssues]);

  const handleRunWithWarnings = useCallback(() => {
    setShowValidationDialog(false);

    if (hasBlockingValidationIssues || running) {
      return;
    }

    void executeWorkflow();
  }, [executeWorkflow, hasBlockingValidationIssues, running]);

  const handleStopTracking = useCallback(() => {
    clearPoll();
    resetExecutionStream();
    setRunning(false);
    setShowResults(false);
    setPendingApproval(null);
    setDebugPausedAtNode(null);
    setDebugActionPending(false);
    if (activeExecutionId) {
      setDismissedExecutionId(activeExecutionId);
    }
    setActiveExecutionId(null);
  }, [activeExecutionId, clearPoll, resetExecutionStream, setDebugPausedAtNode]);

  const sendDebugAction = useCallback(async (action: 'continue' | 'abort') => {
    if (!activeExecutionId || !debugPausedAtNode || debugActionPending) {
      return;
    }

    setDebugActionPending(true);
    try {
      const response = await fetch(`/api/executions/${activeExecutionId}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setDebugPausedAtNode(null);
      setDebugActionPending(false);
      if (action === 'abort') {
        toast({ title: 'Debug execution aborted', description: 'The workflow run has been stopped.' });
      }
    } catch (error) {
      toast({
        title: 'Debug action failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
      setDebugActionPending(false);
    }
  }, [activeExecutionId, debugActionPending, debugPausedAtNode, setDebugPausedAtNode, toast]);

  const handleContinueDebug = useCallback(() => {
    void sendDebugAction('continue');
  }, [sendDebugAction]);

  const handleAbortDebug = useCallback(() => {
    void sendDebugAction('abort');
  }, [sendDebugAction]);

  const handleDismissSelection = useCallback(() => {
    setOutputPanelNodeId(null);
    selectNode(null);
    setIsPanelOpen(false);
  }, [selectNode, setIsPanelOpen, setOutputPanelNodeId]);

  const handleApplyGeneratedWorkflow = useCallback(
    (definition: { nodes: typeof nodes; edges: typeof edges }) => {
      const store = useWorkflowStore.getState();
      store.setNodes(definition.nodes);
      store.setEdges(definition.edges);
      store.selectNode(null);
      store.setOutputPanelNodeId(null);
      store.setIsPanelOpen(false);
      setShowResults(false);
      setShowGenerateDialog(false);

      window.requestAnimationFrame(() => {
        fitCanvasRef.current?.();
      });

      toast({
        title: 'Workflow generated',
        description: `Applied ${definition.nodes.length} nodes and ${definition.edges.length} connections.`,
      });
    },
    [toast]
  );

  const handleIssueClick = useCallback(
    (issue: ValidationIssue) => {
      if (!issue.nodeId) {
        return;
      }

      selectNode(issue.nodeId);
      setOutputPanelNodeId(null);
      setShowValidationDialog(false);
    },
    [selectNode, setOutputPanelNodeId]
  );

  useKeyboardShortcuts({
    disabled: loading || showWorkflowSettings || showChatSettings || showValidationDialog || showShortcuts,
    onSave: () => {
      void handleSave();
    },
    onRun: handleRun,
    onDelete: deleteSelectedElements,
    onEscape: handleDismissSelection,
    onUndo: undo,
    onRedo: redo,
    onToggleHelp: () => setShowShortcuts(true),
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="border-b border-border bg-card px-4 py-3">
        <div className="flex flex-nowrap items-start justify-between gap-3 overflow-x-auto">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Link href="/workflows">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 items-center gap-3">
                <input
                  type="text"
                  value={workflowName}
                  onChange={(event) => setWorkflowName(event.target.value)}
                  placeholder="Untitled Workflow"
                  className="w-full min-w-0 max-w-[200px] border-none bg-transparent text-lg font-semibold focus:outline-none focus:ring-0"
                />
                <Badge variant="outline" className="capitalize">
                  {workflowType}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${getTagColorClasses(tag)}`}
                  >
                    {tag}
                    <button
                      type="button"
                      className="opacity-70 transition-opacity hover:opacity-100"
                      onClick={() => setTags((current) => current.filter((currentTag) => currentTag !== tag))}
                      aria-label={`Remove ${tag} tag`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {showTagInput ? (
                  <Input
                    autoFocus
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onBlur={addTag}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTag();
                      }
                      if (event.key === 'Escape') {
                        setTagDraft('');
                        setShowTagInput(false);
                      }
                    }}
                    placeholder="Add tag"
                    className="h-8 w-32"
                  />
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowTagInput(true)}>
                    <Plus className="mr-1 h-3 w-3" />
                    Tag
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {validationIssues.length === 0 ? (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Valid
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowValidationDialog(true)}
                className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
              >
                <TriangleAlert className="mr-2 h-4 w-4" />
                {validationIssues.length}
              </Button>
            )}
            <Button asChild variant="outline" size="icon" title="Version history">
              <Link href={`/workflows/${workflowId}/history`} title="Version history" aria-label="Version history">
                <History className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="icon" onClick={handleExport} title="Export workflow" aria-label="Export workflow">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
              <Keyboard className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setDebugMode(!debugMode)}
              title={debugMode ? 'Disable debug mode' : 'Enable debug mode'}
              aria-label={debugMode ? 'Disable debug mode' : 'Enable debug mode'}
              className={cn(debugMode && 'border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/15')}
            >
              <Bug className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowChatSettings(true)} title="Publish as chatbot" aria-label="Publish as chatbot">
              <MessageSquareText className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowWorkflowSettings(true)} title="Workflow settings" aria-label="Workflow settings">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowGenerateDialog(true)}>
              <Sparkles className="mr-2 h-4 w-4 text-amber-500" />
              Generate with AI
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAgentDeployName(workflowName);
                setAgentDeployDescription(workflowDescription);
                setShowDeployAgentDialog(true);
              }}
            >
              <Bot className="mr-2 h-4 w-4" />
              Deploy
            </Button>
            <Button size="sm" onClick={handleRun} disabled={running}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {running ? 'Running...' : 'Run'}
            </Button>
          </div>
        </div>
      </div>

      {pendingApproval ? (
        <ApprovalBanner
          approval={pendingApproval}
          onDecisionSubmitted={() => {
            setPendingApproval(null);
            if (activeExecutionId) {
              void fetchPendingApproval(activeExecutionId);
            }
          }}
        />
      ) : null}

      {workflowType === 'agent' ? (
        <div className="border-b border-border px-4 py-4">
          <CostDashboard agentId={workflowId} />
        </div>
      ) : null}

      <div className={cn('min-h-0 flex-1', statusBarVisible && 'pb-12')}>
        <WorkflowCanvasNew
          executionId={activeExecutionId}
          executionNodeStates={nodeStates}
          nodeExecutions={displayExecution?.nodeExecutions ?? []}
          executionOutputs={executionOutputs}
          isRunning={liveExecutionStatus === 'running'}
          hideConfigPanel={showResults}
          debugPausedAtNode={debugPausedAtNode}
          onDebugContinue={handleContinueDebug}
          onDebugAbort={handleAbortDebug}
          debugActionPending={debugActionPending}
          onFitViewReady={(fitViewToCanvas) => {
            fitCanvasRef.current = fitViewToCanvas;
          }}
        />
      </div>

      <GenerateWorkflowDialog
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
        workflowId={workflowId}
        onApply={(definition) => handleApplyGeneratedWorkflow(definition)}
      />

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

      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Workflow validation</DialogTitle>
            <DialogDescription>
              {hasBlockingValidationIssues
                ? 'Resolve the blocking issues below before running this workflow.'
                : 'These warnings will not block execution, but you may want to review them first.'}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {validationIssues.map((issue, index) => {
              const issueContent = (
                <>
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'mt-0.5 rounded-full p-1',
                        issue.severity === 'error'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-amber-500/10 text-amber-600'
                      )}
                    >
                      <TriangleAlert className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{issue.message}</span>
                        <Badge variant="outline" className="capitalize">
                          {issue.severity}
                        </Badge>
                      </div>
                      {issue.nodeName && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Click to select <span className="font-medium text-foreground">{issue.nodeName}</span> on the canvas.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              );

              if (!issue.nodeId) {
                return (
                  <div key={`${issue.message}-${index}`} className="rounded-lg border border-border bg-muted/30 p-3">
                    {issueContent}
                  </div>
                );
              }

              return (
                <button
                  key={`${issue.nodeId}-${issue.message}`}
                  type="button"
                  onClick={() => handleIssueClick(issue)}
                  className="w-full rounded-lg border border-border bg-muted/30 p-3 text-left transition-colors hover:bg-accent"
                >
                  {issueContent}
                </button>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowValidationDialog(false)}>
              {hasBlockingValidationIssues ? 'Close' : 'Cancel'}
            </Button>
            {!hasBlockingValidationIssues && validationIssues.length > 0 && (
              <Button onClick={handleRunWithWarnings}>Run anyway</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Use these shortcuts anywhere on the canvas when you are not typing in a field.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {shortcutRows.map((shortcut) => (
              <div
                key={`${shortcut.description}-${shortcut.keys.join('-')}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <span className="text-sm text-foreground">{shortcut.description}</span>
                <div className="flex flex-wrap justify-end gap-1">
                  {shortcut.keys.map((key) => (
                    <kbd
                      key={`${shortcut.description}-${key}`}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm"
                    >
                      {key}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeployAgentDialog} onOpenChange={setShowDeployAgentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deploy as Agent</DialogTitle>
            <DialogDescription>
              Give this workflow a persistent identity, memory namespace, and lifecycle controls.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="agent-name" className="text-sm font-medium text-foreground">
                Agent name
              </label>
              <Input id="agent-name" value={agentDeployName} onChange={(event) => setAgentDeployName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <label htmlFor="agent-description" className="text-sm font-medium text-foreground">
                Description
              </label>
              <Textarea
                id="agent-description"
                value={agentDeployDescription}
                onChange={(event) => setAgentDeployDescription(event.target.value)}
                placeholder="What does this agent own?"
                className="min-h-[120px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeployAgentDialog(false)} disabled={deployingAgent}>
              Cancel
            </Button>
            <Button onClick={() => void handleDeployAgent()} disabled={deployingAgent || !agentDeployName.trim()}>
              {deployingAgent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
              {deployingAgent ? 'Deploying...' : 'Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <ChatSettingsDialog
        workflowId={workflowId}
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

      <ExecutionResultsPanel execution={displayExecution} isOpen={showResults} onClose={() => setShowResults(false)} />
    </div>
  );
}
