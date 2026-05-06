'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  ConnectionLineType,
  Controls,
  MiniMap,
  ReactFlowProvider,
  NodeTypes,
  type Edge,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type OnConnectStartParams,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Braces, Check, Maximize2, NotebookPen, Plus, RotateCcw, RotateCw, StickyNote as StickyNoteIcon, Workflow, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { getNodeByType } from '@/lib/nodes/registry';
import { CustomNode } from './custom-node';
import { StickyNoteNode, type StickyNoteNodeData } from './sticky-note-node';
import { NodePalette } from './node-palette';
import { NodeConfigPanel } from './node-config-panel';
import {
  WorkflowNodeData,
  type NodeExecutionOutput,
  NodeType,
  type StickyNote,
} from '@/types/nodes';
import type { NodeExecutionState as StreamNodeExecutionState } from '@/hooks/use-execution-stream';
import { cn } from '@/lib/utils';

const STICKY_NOTE_WIDTH = 260;
const STICKY_NOTE_HEIGHT = 200;

const nodeTypes: NodeTypes = {
  custom: CustomNode,
  stickyNote: StickyNoteNode,
};

type CanvasExecutionStatus = NonNullable<WorkflowNodeData['executionStatus']>;

type CanvasNodeExecutionState = {
  status: CanvasExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  error?: string;
};

type WorkflowExecutionNode = {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  duration?: number;
  startedAt?: number;
  completedAt?: number;
};

function getNodeVariableFields(node: Node<WorkflowNodeData>) {
  const nodeInfo = getNodeByType(node.data.type);
  if (!nodeInfo) {
    return ['output'];
  }

  if (node.data.type === NodeType.CONTROL_SWITCH) {
    const configuredCases = Array.isArray(node.data.config?.cases) ? node.data.config.cases : [];
    return [
      ...configuredCases.map((entry: Record<string, unknown>, index: number) => String(entry?.branchKey || entry?.label || `case_${index + 1}`)),
      'default',
    ];
  }

  if (node.data.type === NodeType.AI_QUESTION_CLASSIFIER) {
    const configuredClasses = Array.isArray(node.data.config?.classes) ? node.data.config.classes : [];
    return [
      ...configuredClasses.map((entry: Record<string, unknown>, index: number) => String(entry?.id || entry?.name || `class_${index + 1}`)),
      'default',
    ];
  }

  const registryOutputs = nodeInfo.outputs.map((output) => output.name);
  if (node.data.type.toString().startsWith('ai.')) {
    return Array.from(new Set([...registryOutputs, 'text', 'usage']));
  }
  if (node.data.type === NodeType.INTEGRATION_HTTP) {
    return Array.from(new Set([...registryOutputs, 'status_code', 'headers', 'body']));
  }

  return registryOutputs.length > 0 ? registryOutputs : ['output'];
}

interface WorkflowCanvasNewProps {
  executionId?: string | null;
  executionNodeStates?: Record<string, StreamNodeExecutionState>;
  nodeExecutions?: WorkflowExecutionNode[];
  executionOutputs?: Record<string, NodeExecutionOutput>;
  isRunning?: boolean;
  hideConfigPanel?: boolean;
  debugPausedAtNode?: string | null;
  onDebugContinue?: () => void;
  onDebugAbort?: () => void;
  debugActionPending?: boolean;
  onFitViewReady?: (fitViewToCanvas: () => void) => void;
}

function WorkflowCanvasInner({
  executionId,
  executionNodeStates = {},
  nodeExecutions = [],
  executionOutputs = {},
  isRunning = false,
  hideConfigPanel = false,
  onFitViewReady,
}: WorkflowCanvasNewProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, setCenter, getViewport, project } = useReactFlow();

  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const stickyNotes = useWorkflowStore((state) => state.stickyNotes);
  const selectedNode = useWorkflowStore((state) => state.selectedNode);
  const history = useWorkflowStore((state) => state.history);
  const historyIndex = useWorkflowStore((state) => state.historyIndex);
  const onNodesChange = useWorkflowStore((state) => state.onNodesChange);
  const onEdgesChange = useWorkflowStore((state) => state.onEdgesChange);
  const onConnect = useWorkflowStore((state) => state.onConnect);
  const addNode = useWorkflowStore((state) => state.addNode);
  const addStickyNote = useWorkflowStore((state) => state.addStickyNote);
  const updateStickyNote = useWorkflowStore((state) => state.updateStickyNote);
  const deleteStickyNote = useWorkflowStore((state) => state.deleteStickyNote);
  const pushHistory = useWorkflowStore((state) => state.pushHistory);
  const deleteNode = useWorkflowStore((state) => state.deleteNode);
  const selectNode = useWorkflowStore((state) => state.selectNode);
  const setOutputPanelNodeId = useWorkflowStore((state) => state.setOutputPanelNodeId);
  const setExecutionContext = useWorkflowStore((state) => state.setExecutionContext);
  const setConnectionPreview = useWorkflowStore((state) => state.setConnectionPreview);
  const clearConnectionPreview = useWorkflowStore((state) => state.clearConnectionPreview);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const [selectedStickyNoteId, setSelectedStickyNoteId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; flowX: number; flowY: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  const stickyNoteIds = useMemo(() => new Set(stickyNotes.map((note) => note.id)), [stickyNotes]);

  const nodeExecutionMap = useMemo<Record<string, CanvasNodeExecutionState>>(() => {
    const map: Record<string, CanvasNodeExecutionState> = {};

    nodeExecutions.forEach((nodeExecution) => {
      if (nodeExecution.status === 'cancelled') {
        return;
      }

      map[nodeExecution.nodeId] = {
        status: nodeExecution.status,
        error: nodeExecution.error,
        durationMs: nodeExecution.duration,
        startedAt: nodeExecution.startedAt,
        completedAt: nodeExecution.completedAt,
      };
    });

    Object.entries(executionNodeStates).forEach(([nodeId, state]) => {
      map[nodeId] = {
        status: state.status,
        error: state.error ?? map[nodeId]?.error,
        durationMs: state.durationMs ?? map[nodeId]?.durationMs,
        startedAt: state.startedAt ?? map[nodeId]?.startedAt,
        completedAt: state.completedAt ?? map[nodeId]?.completedAt,
      };
    });

    return map;
  }, [executionNodeStates, nodeExecutions]);

  useEffect(() => {
    setExecutionContext(executionId ?? null, nodeExecutions);
  }, [executionId, nodeExecutions, setExecutionContext]);

  useEffect(() => {
    if (!copiedVariable) {
      return;
    }

    const timeout = window.setTimeout(() => setCopiedVariable(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [copiedVariable]);

  const availableVariables = useMemo(
    () =>
      nodes.flatMap((node) =>
        getNodeVariableFields(node).map((field) => ({
          id: `${node.id}.${field}`,
          value: `{{${node.id}.${field}}}`,
          label: `${node.data.config?.label || node.id}.${field}`,
        }))
      ),
    [nodes]
  );

  const displayNodes = useMemo<Node[]>(() => {
    const workflowNodes = nodes.map((node) => {
      const executionState = nodeExecutionMap[node.id];
      const executionStatus = executionState?.status ?? 'idle';
      const status =
        executionStatus === 'failed'
          ? 'error'
          : executionStatus === 'pending'
            ? 'idle'
            : executionStatus;

      return {
        ...node,
        data: {
          ...(node.data as WorkflowNodeData & {
            executionState?: CanvasNodeExecutionState;
            executionOutput?: NodeExecutionOutput;
          }),
          executionState,
          executionOutput: executionOutputs[node.id],
          executionStatus,
          status,
          error:
            executionStatus === 'failed'
              ? executionState?.error ?? executionOutputs[node.id]?.error ?? node.data.error
              : node.data.error,
        } as WorkflowNodeData,
      };
    });

    const noteNodes: Node<StickyNoteNodeData>[] = stickyNotes.map((note) => ({
      id: note.id,
      type: 'stickyNote',
      position: { x: note.x, y: note.y },
      selected: selectedStickyNoteId === note.id,
      dragHandle: '.sticky-note-drag-handle',
      // Set width/height directly so React Flow skips the "hidden until measured" phase
      width: note.width,
      height: note.height,
      style: {
        width: note.width,
        height: note.height,
      },
      data: { note },
    }));

    return [...workflowNodes, ...noteNodes];
  }, [executionOutputs, nodeExecutionMap, nodes, selectedStickyNoteId, stickyNotes]);

  const animatedEdges = useMemo<Edge[]>(() => {
    if (!executionId) {
      return edges;
    }

    return edges.map((edge) => {
      const sourceState = nodeExecutionMap[edge.source]?.status;
      const targetState = nodeExecutionMap[edge.target]?.status;
      const isFlowing = isRunning && sourceState === 'completed' && targetState === 'running';
      const isFailedPath = sourceState === 'failed' || targetState === 'failed';

      if (isFlowing) {
        return {
          ...edge,
          animated: true,
          style: {
            ...edge.style,
            stroke: '#3b82f6',
            strokeWidth: 2,
            opacity: 1,
            filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.45))',
          },
        };
      }

      if (isFailedPath) {
        return {
          ...edge,
          animated: false,
          style: {
            ...edge.style,
            stroke: 'var(--color-red-500)',
            strokeWidth: 2.5,
            opacity: 0.95,
          },
        };
      }

      return {
        ...edge,
        animated: false,
        style: edge.style ? { ...edge.style } : undefined,
      };
    });
  }, [edges, executionId, isRunning, nodeExecutionMap]);

  useEffect(() => {
    onFitViewReady?.(() => fitView({ padding: 0.2, duration: 400 }));
  }, [fitView, onFitViewReady]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      !!target.closest('input, textarea, select, [contenteditable="true"]');

    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;

      if (hasModifier && event.shiftKey && key === 'f') {
        event.preventDefault();
        fitView({ padding: 0.2, duration: 400 });
        return;
      }

      if (hasModifier && !event.shiftKey && key === 'z') {
        event.preventDefault();
        undo();
        return;
      }

      if (hasModifier && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault();
        redo();
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if ((key === 'backspace' || key === 'delete') && selectedNode) {
        event.preventDefault();
        deleteNode(selectedNode.id);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteNode, fitView, redo, selectedNode, undo]);

  const createStickyNoteAt = useCallback((flowX: number, flowY: number, panTo = false) => {
    const noteId = `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const note: StickyNote = {
      id: noteId,
      x: flowX - STICKY_NOTE_WIDTH / 2,
      y: flowY - STICKY_NOTE_HEIGHT / 2,
      width: STICKY_NOTE_WIDTH,
      height: STICKY_NOTE_HEIGHT,
      content: '',
      color: 'yellow',
    };
    addStickyNote(note);
    setSelectedStickyNoteId(noteId);
    if (panTo) {
      window.setTimeout(() => {
        setCenter(note.x + STICKY_NOTE_WIDTH / 2, note.y + STICKY_NOTE_HEIGHT / 2, {
          zoom: Math.max(getViewport().zoom, 0.75),
          duration: 350,
        });
      }, 60);
    }
    return note;
  }, [addStickyNote, getViewport, setCenter]);

  const createStickyNoteAtViewportCenter = useCallback(() => {
    const wrapper = reactFlowWrapper.current;
    const bounds = wrapper ? wrapper.getBoundingClientRect() : { width: 800, height: 600 };
    // project() takes coordinates relative to the React Flow container element
    const flowPos = project({ x: bounds.width / 2, y: bounds.height / 2 });
    createStickyNoteAt(flowPos.x, flowPos.y, true);
  }, [createStickyNoteAt, project]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const wrapper = reactFlowWrapper.current;
    const bounds = wrapper?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const relX = event.clientX - bounds.left;
    const relY = event.clientY - bounds.top;
    const flowPos = project({ x: relX, y: relY });
    setContextMenu({ screenX: event.clientX, screenY: event.clientY, flowX: flowPos.x, flowY: flowPos.y });
  }, [project]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const getChangeId = (change: NodeChange) => ('id' in change ? change.id : null);
      const workflowChanges = changes.filter((change) => {
        const changeId = getChangeId(change);
        return !changeId || !stickyNoteIds.has(changeId);
      });
      const stickyChanges = changes.filter((change) => {
        const changeId = getChangeId(change);
        return Boolean(changeId && stickyNoteIds.has(changeId));
      });

      if (workflowChanges.length > 0) {
        onNodesChange(workflowChanges);
      }

      if (stickyChanges.length === 0) {
        return;
      }

      const shouldTrackStickyHistory = stickyChanges.some((change) => {
        if (change.type === 'remove') {
          return true;
        }
        if (change.type === 'position' && 'dragging' in change) {
          return !change.dragging;
        }
        if (change.type === 'dimensions' && 'resizing' in change) {
          return !change.resizing;
        }
        return false;
      });

      if (shouldTrackStickyHistory) {
        pushHistory();
      }

      stickyChanges.forEach((change) => {
        if (change.type === 'position' && change.position) {
          updateStickyNote(change.id, {
            x: change.position.x,
            y: change.position.y,
          });
          return;
        }

        if (change.type === 'dimensions' && change.dimensions) {
          updateStickyNote(change.id, {
            width: Math.round(change.dimensions.width),
            height: Math.round(change.dimensions.height),
          });
          return;
        }

        if (change.type === 'remove') {
          deleteStickyNote(change.id);
          if (selectedStickyNoteId === change.id) {
            setSelectedStickyNoteId(null);
          }
          return;
        }

        if (change.type === 'select') {
          if (change.selected) {
            setSelectedStickyNoteId(change.id);
            selectNode(null);
            setOutputPanelNodeId(null);
          } else if (selectedStickyNoteId === change.id) {
            setSelectedStickyNoteId(null);
          }
        }
      });

      if (shouldTrackStickyHistory) {
        pushHistory();
      }
    },
    [deleteStickyNote, onNodesChange, pushHistory, selectNode, selectedStickyNoteId, setOutputPanelNodeId, stickyNoteIds, updateStickyNote]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/reactflow') as NodeType;

      if (!nodeType || !reactFlowWrapper.current) {
        return;
      }

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const viewport = getViewport();
      const position = {
        x: (event.clientX - reactFlowBounds.left - viewport.x) / viewport.zoom - 110,
        y: (event.clientY - reactFlowBounds.top - viewport.y) / viewport.zoom - 50,
      };

      addNode(nodeType, position);
      setSelectedStickyNoteId(null);
    },
    [addNode, getViewport]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (stickyNoteIds.has(node.id)) {
        setSelectedStickyNoteId(node.id);
        selectNode(null);
        setOutputPanelNodeId(null);
        return;
      }

      setSelectedStickyNoteId(null);
      selectNode(node.id);
      const nodeExecutionState = executionNodeStates[node.id]?.status;
      const nodeExecutionOutput = executionOutputs[node.id];
      if (
        nodeExecutionState === 'completed' ||
        nodeExecutionState === 'failed' ||
        typeof nodeExecutionOutput?.output !== 'undefined' ||
        Boolean(nodeExecutionOutput?.error)
      ) {
        setOutputPanelNodeId(node.id);
      }
    },
    [executionNodeStates, executionOutputs, selectNode, setOutputPanelNodeId, stickyNoteIds]
  );

  const onPaneClick = useCallback(() => {
    setOutputPanelNodeId(null);
    setSelectedStickyNoteId(null);
    selectNode(null);
  }, [selectNode, setOutputPanelNodeId]);

  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return false;
    }

    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!targetNode) {
      return false;
    }

    const targetInfo = getNodeByType(targetNode.data.type);
    return Boolean(targetInfo && targetInfo.inputs.length > 0);
  }, [nodes]);

  const onConnectStart = useCallback((_: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
    const sourceNodeId = params.nodeId;
    if (!sourceNodeId) {
      clearConnectionPreview();
      return;
    }

    const compatibleTargetNodeIds = nodes
      .filter((node) => node.id !== sourceNodeId)
      .filter((node) => !stickyNoteIds.has(node.id))
      .filter((node) => {
        const nodeInfo = getNodeByType(node.data.type);
        return Boolean(nodeInfo && nodeInfo.inputs.length > 0);
      })
      .map((node) => node.id);

    setConnectionPreview({
      active: true,
      sourceNodeId,
      compatibleTargetNodeIds,
    });
  }, [clearConnectionPreview, nodes, setConnectionPreview, stickyNoteIds]);

  const onConnectEnd = useCallback(() => {
    clearConnectionPreview();
  }, [clearConnectionPreview]);

  const handleCopyVariable = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedVariable(value);
    } catch {
      setCopiedVariable(null);
    }
  }, []);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const hasCanvasNodes = displayNodes.length > 0;

  return (
    <div className="relative flex h-full min-h-0">
      <div className="relative min-h-0 flex-1" ref={reactFlowWrapper}>
        {paletteOpen && <div className="absolute inset-0 z-[25] bg-background/40 backdrop-blur-[1px]" onClick={() => setPaletteOpen(false)} />}

        <button
          type="button"
          onClick={() => setPaletteOpen((current) => !current)}
          title={paletteOpen ? 'Close node palette' : 'Open node palette'}
          aria-label={paletteOpen ? 'Close node palette' : 'Open node palette'}
          className={cn(
            'absolute left-4 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 shadow-lg transition-all duration-300 hover:bg-zinc-700 hover:text-white',
            paletteOpen && 'border-primary/60 bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {paletteOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>

        <div
          className={cn(
            'absolute bottom-0 left-12 top-0 z-30 w-72 border-r border-border bg-card shadow-xl transition-all duration-300',
            paletteOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-full opacity-0'
          )}
        >
          <NodePalette autoFocusSearch={paletteOpen} onNodeAdded={() => setPaletteOpen(false)} />
        </div>
        {!hasCanvasNodes && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Workflow className="mx-auto mb-3 h-12 w-12 opacity-20" />
              <p className="text-sm font-medium opacity-40">Open the node palette to get started</p>
              <p className="mt-1 text-xs opacity-30">Press Space to add a node</p>
            </div>
          </div>
        )}

        <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="shadow-sm" onClick={createStickyNoteAtViewportCenter}>
            <NotebookPen className="mr-2 h-4 w-4" />
            Add Sticky Note
          </Button>
        </div>

        <div className="absolute bottom-4 left-4 z-20 flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={() => setVariablesOpen((current) => !current)}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300 shadow-lg transition-colors hover:bg-zinc-700 hover:text-white',
              variablesOpen && 'border-indigo-500/60 bg-indigo-500 text-white hover:bg-indigo-500/90'
            )}
            title="Variables"
            aria-label="Toggle variables panel"
          >
            <Braces className="h-4 w-4" />
          </button>

          {variablesOpen && (
            <div className="w-[320px] rounded-xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Variables</div>
                  <div className="text-xs text-muted-foreground">Click to copy a variable reference</div>
                </div>
                <span className="text-[11px] text-zinc-500">{availableVariables.length} refs</span>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {availableVariables.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Add nodes to see output variables.
                  </div>
                ) : (
                  availableVariables.map((variable) => (
                    <button
                      key={variable.id}
                      type="button"
                      onClick={() => void handleCopyVariable(variable.value)}
                      className="flex w-full items-center justify-between rounded-md border border-transparent bg-muted/40 px-3 py-2 text-left transition-colors hover:border-indigo-500/30 hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-mono text-xs text-foreground">{variable.value}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{variable.label}</div>
                      </div>
                      {copiedVariable === variable.value ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="rounded-lg border border-border bg-card p-2 shadow-md transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="rounded-lg border border-border bg-card p-2 shadow-md transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => fitView({ padding: 0.2, duration: 400 })}
            className="rounded-lg border border-border bg-card p-2 shadow-md transition-colors hover:bg-accent"
            title="Fit to screen (Ctrl+Shift+F)"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        <ReactFlow
          nodes={displayNodes}
          edges={animatedEdges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onNodeClick={onNodeClick}
          onPaneClick={() => { onPaneClick(); closeContextMenu(); }}
          onPaneContextMenu={onPaneContextMenu}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={['Backspace', 'Delete']}
          connectionLineStyle={{ stroke: 'var(--color-sky-500)', strokeWidth: 2, strokeDasharray: '5,5' }}
          connectionLineType={ConnectionLineType.Bezier}
          className="bg-background"
          defaultEdgeOptions={{
            animated: false,
            style: { stroke: 'var(--color-border)', strokeWidth: 2.5 },
            type: 'default',
          }}
        >
          <Background gap={16} size={1} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'stickyNote') {
                return (node.data as StickyNoteNodeData).note.color === 'yellow'
                  ? '#facc15'
                  : (node.data as StickyNoteNodeData).note.color === 'blue'
                    ? '#3b82f6'
                    : (node.data as StickyNoteNodeData).note.color === 'green'
                      ? '#22c55e'
                      : (node.data as StickyNoteNodeData).note.color === 'pink'
                        ? '#ec4899'
                        : '#a855f7';
              }

              const nodeData = node.data as WorkflowNodeData;
              switch (nodeData.executionStatus ?? nodeData.status) {
                case 'pending':
                  return 'var(--color-yellow-500)';
                case 'running':
                  return 'var(--color-blue-500)';
                case 'completed':
                  return 'var(--color-green-500)';
                case 'failed':
                case 'error':
                  return 'var(--color-red-500)';
                default:
                  return 'var(--color-muted-foreground)';
              }
            }}
            maskColor="rgba(0,0,0,0.2)"
            style={{
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
            }}
            zoomable
            pannable
          />
        </ReactFlow>

        {/* Right-click context menu */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} />
            <div
              className="fixed z-50 min-w-[180px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
              style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
            >
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => { createStickyNoteAt(contextMenu.flowX, contextMenu.flowY); closeContextMenu(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <StickyNoteIcon className="h-4 w-4 text-amber-400" />
                  Add Sticky Note
                </button>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => { fitView({ padding: 0.2, duration: 400 }); closeContextMenu(); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Maximize2 className="h-4 w-4" />
                  Fit to Screen
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <NodeConfigPanel hidden={hideConfigPanel} />
    </div>
  );
}

export function WorkflowCanvasNew(props: WorkflowCanvasNewProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
