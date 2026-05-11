'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  ConnectionLineType,
  Controls,
  MiniMap,
  ReactFlowProvider,
  NodeTypes,
  type Connection,
  type Edge,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type OnConnectStartParams,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Braces, Check, LayoutTemplate, Maximize2, NotebookPen, Plus, RotateCcw, RotateCw, StickyNote as StickyNoteIcon, Workflow, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { getNodeByType } from '@/lib/nodes/registry';
import { CustomNode } from './custom-node';
import CustomEdge from './custom-edge';
import { NodeSearch } from './node-search';
import { SubNode } from './sub-node';
import { StickyNoteNode, type StickyNoteNodeData } from './sticky-note-node';
import { NodePalette } from './node-palette';
import { NodeConfigPanel } from './node-config-panel';
import { QuickAddMenu } from './quick-add-menu';
import {
  AGENT_NODE_TYPES,
  WorkflowNodeData,
  type NodeExecutionOutput,
  NodeType,
  type StickyNote,
  getSubNodeRoleForType,
  isDependencyHandleId,
  type SubNodeRole,
} from '@/types/nodes';
import type { NodeExecutionState as StreamNodeExecutionState } from '@/hooks/use-execution-stream';
import { cn } from '@/lib/utils';
import { applyDagreLayout } from '@/lib/workflow-layout';
import { useKeyboardShortcuts } from './use-keyboard-shortcuts';

const STICKY_NOTE_WIDTH = 260;
const STICKY_NOTE_HEIGHT = 200;
const WORKFLOW_NODE_WIDTH = 220;
const QUICK_ADD_NODE_GAP = 80;
const QUICK_ADD_NODE_OFFSET_X = WORKFLOW_NODE_WIDTH + QUICK_ADD_NODE_GAP;
// Only auto-connect when dropping 0–100px to the RIGHT of a node's right edge and within 80px vertically
const QUICK_ADD_X_SNAP_MAX = 100;
const QUICK_ADD_Y_SNAP_THRESHOLD = 80;

const nodeTypes: NodeTypes = {
  custom: CustomNode,
  subNode: SubNode,
  stickyNote: StickyNoteNode,
};

const edgeTypes = {
  default: CustomEdge,
  smoothstep: CustomEdge,
};

const dependencyEdgeStyle = {
  strokeDasharray: '6 4',
  stroke: 'rgba(148,163,184,0.5)',
  strokeWidth: 1.5,
  opacity: 0.85,
};

function getDependencyDropTarget(target: EventTarget | null): { nodeId: string; role: SubNodeRole } | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const handle = target.closest('.react-flow__handle') as HTMLElement | null;
  const handleId = handle?.getAttribute('data-handleid') ?? handle?.dataset.handleid ?? null;
  const nodeId = handle?.getAttribute('data-nodeid') ?? handle?.dataset.nodeid ?? null;

  if (!isDependencyHandleId(handleId) || !nodeId) {
    return null;
  }

  return { nodeId, role: handleId };
}

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
  const [paletteFilterRole, setPaletteFilterRole] = useState<SubNodeRole | undefined>();
  const [paletteTargetNodeId, setPaletteTargetNodeId] = useState<string | null>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);
  const [quickAddSource, setQuickAddSource] = useState<{ nodeId: string; handleId: string; x: number; y: number } | null>(null);
  const [nodeSearchOpen, setNodeSearchOpen] = useState(false);

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

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPaletteFilterRole(undefined);
    setPaletteTargetNodeId(null);
  }, []);

  const closeQuickAddMenu = useCallback(() => {
    setQuickAddSource(null);
  }, []);

  const getPaletteNodePosition = useCallback((targetNodeId: string, role: SubNodeRole) => {
    const targetNode = nodes.find((node) => node.id === targetNodeId);
    if (!targetNode) {
      return null;
    }

    const connectedCount = edges.filter((edge) => edge.target === targetNodeId && edge.targetHandle === role && edge.data?.isDependency).length;
    const roleOffset = role === 'model' ? -120 : role === 'memory' ? 0 : 120 + connectedCount * 110;

    return {
      x: targetNode.position.x + roleOffset,
      y: targetNode.position.y + 170,
    };
  }, [edges, nodes]);

  const addNodeFromPalette = useCallback((nodeType: NodeType) => {
    if (!reactFlowWrapper.current) {
      return;
    }

    const explicitRole = paletteFilterRole ?? getSubNodeRoleForType(nodeType, getNodeByType(nodeType)?.category);
    if (paletteTargetNodeId && paletteFilterRole && explicitRole === paletteFilterRole) {
      const position = getPaletteNodePosition(paletteTargetNodeId, paletteFilterRole);
      const newNode = addNode(nodeType, position ?? undefined, { subNodeRole: paletteFilterRole });
      if (newNode) {
        onConnect({
          source: newNode.id,
          sourceHandle: 'output',
          target: paletteTargetNodeId,
          targetHandle: paletteFilterRole,
        } as Connection);
      }
      return;
    }

    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const center = project({ x: bounds.width / 2, y: bounds.height / 2 });
    addNode(nodeType, { x: center.x - 110, y: center.y - 50 }, { subNodeRole: null });
  }, [addNode, getPaletteNodePosition, onConnect, paletteFilterRole, paletteTargetNodeId, project]);

  const handleQuickAddNode = useCallback((nodeType: NodeType) => {
    if (!quickAddSource) {
      return;
    }

    const sourceNode = nodes.find((node) => node.id === quickAddSource.nodeId);
    if (!sourceNode) {
      closeQuickAddMenu();
      return;
    }

    const newNode = addNode(
      nodeType,
      {
        x: sourceNode.position.x + QUICK_ADD_NODE_OFFSET_X,
        y: sourceNode.position.y,
      },
      { subNodeRole: null }
    );

    if (newNode) {
      const targetNodeInfo = getNodeByType(nodeType);
      if (targetNodeInfo && targetNodeInfo.inputs.length > 0) {
        onConnect({
          source: quickAddSource.nodeId,
          sourceHandle: quickAddSource.handleId,
          target: newNode.id,
          targetHandle: 'input',
        } as Connection);
      }
    }

    closeQuickAddMenu();
  }, [addNode, closeQuickAddMenu, nodes, onConnect, quickAddSource]);

  useEffect(() => {
    const handleOpenSubNodePalette = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string; role?: SubNodeRole }>).detail;
      if (!detail?.nodeId || !detail.role) {
        return;
      }
      setPaletteTargetNodeId(detail.nodeId);
      setPaletteFilterRole(detail.role);
      setPaletteOpen(true);
    };

    window.addEventListener('open-sub-node-palette', handleOpenSubNodePalette as EventListener);
    return () => window.removeEventListener('open-sub-node-palette', handleOpenSubNodePalette as EventListener);
  }, []);

  useEffect(() => {
    const handleQuickAdd = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: string; handleId: string; x: number; y: number }>).detail;
      if (!detail?.nodeId || !detail.handleId) {
        return;
      }
      setQuickAddSource(detail);
    };

    window.addEventListener('node-quick-add', handleQuickAdd as EventListener);
    return () => window.removeEventListener('node-quick-add', handleQuickAdd as EventListener);
  }, []);

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
        type: node.data.subNodeRole ? 'subNode' : node.type,
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

  const displayEdges = useMemo<Edge[]>(() => edges.map((edge) => {
    const sourceState = nodeExecutionMap[edge.source]?.status;
    const targetState = nodeExecutionMap[edge.target]?.status;
    const durationMs = nodeExecutionMap[edge.source]?.durationMs;
    const isExecutionComplete = !isRunning && Boolean(executionId) && Object.keys(nodeExecutionMap).length > 0;
    const label = edge.data?.label ?? (edge.sourceHandle === 'true' || edge.sourceHandle === 'false' ? edge.sourceHandle : undefined);
    const edgeData = {
      ...edge.data,
      label,
      durationMs,
      heatmapActive: isExecutionComplete && typeof durationMs === 'number',
    };

    if (edge.data?.isDependency) {
      return {
        ...edge,
        data: edgeData,
        animated: false,
        style: {
          ...edge.style,
          ...dependencyEdgeStyle,
        },
      };
    }

    if (!executionId) {
      return {
        ...edge,
        data: edgeData,
        animated: false,
        style: edge.style ? { ...edge.style } : undefined,
      };
    }

    const isFlowing = isRunning && sourceState === 'completed' && targetState === 'running';
    const isFailedPath = sourceState === 'failed' || targetState === 'failed';

    if (isFlowing) {
      return {
        ...edge,
        data: edgeData,
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
        data: edgeData,
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
      data: edgeData,
      animated: false,
      style: edge.style ? { ...edge.style } : undefined,
    };
  }), [edges, executionId, isRunning, nodeExecutionMap]);

  const handleAutoLayout = useCallback(() => {
    if (nodes.length === 0) {
      return;
    }

    const layoutedNodes = applyDagreLayout(nodes, edges) as Node<WorkflowNodeData>[];
    pushHistory();
    useWorkflowStore.setState((state) => ({
      nodes: layoutedNodes,
      selectedNode: state.selectedNode ? layoutedNodes.find((node) => node.id === state.selectedNode?.id) ?? null : null,
    }));
    pushHistory();
    window.requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 400 });
    });
  }, [edges, fitView, nodes, pushHistory]);

  const handleNodeSearchSelect = useCallback((nodeId: string) => {
    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return;
    }

    setSelectedStickyNoteId(null);
    selectNode(nodeId);
    setCenter(node.position.x, node.position.y, { zoom: 1.2, duration: 400 });
  }, [nodes, selectNode, setCenter]);

  useKeyboardShortcuts({
    onSearch: () => setNodeSearchOpen(true),
  });

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
        setPaletteFilterRole(undefined);
        setPaletteTargetNodeId(null);
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
    const noteId = `sticky-${crypto.randomUUID()}`;
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
      const dropTarget = getDependencyDropTarget(document.elementFromPoint(event.clientX, event.clientY) ?? event.target);
      const nodeInfo = getNodeByType(nodeType);
      const subNodeRole = getSubNodeRoleForType(nodeType, nodeInfo?.category);
      const canAutoConnect = !subNodeRole && Boolean(nodeInfo && nodeInfo.inputs.length > 0);
      const nearbySourceNode = canAutoConnect
        ? nodes.reduce<Node<WorkflowNodeData> | null>((closestNode, node) => {
            if (stickyNoteIds.has(node.id)) {
              return closestNode;
            }

            const sourceNodeInfo = getNodeByType(node.data.type);
            if (!sourceNodeInfo || !sourceNodeInfo.outputs.some((output) => output.name === 'output')) {
              return closestNode;
            }

            const nodeRightX = node.position.x + WORKFLOW_NODE_WIDTH;
            const nodeCenterY = node.position.y + 50;
            const deltaX = position.x - nodeRightX; // positive = dropped to the right
            const deltaY = Math.abs(position.y - nodeCenterY);

            // Only snap when dropped clearly to the right (0–100px) and close vertically
            if (deltaX < 0 || deltaX > QUICK_ADD_X_SNAP_MAX || deltaY >= QUICK_ADD_Y_SNAP_THRESHOLD) {
              return closestNode;
            }

            if (!closestNode) {
              return node;
            }

            const closestDeltaX = Math.abs(position.x - (closestNode.position.x + WORKFLOW_NODE_WIDTH));
            const closestDeltaY = Math.abs(position.y - (closestNode.position.y + 50));
            return deltaX + deltaY < closestDeltaX + closestDeltaY ? node : closestNode;
          }, null)
        : null;

      if (dropTarget && subNodeRole === dropTarget.role) {
        const dependencyPosition = getPaletteNodePosition(dropTarget.nodeId, dropTarget.role) ?? position;
        const newNode = addNode(nodeType, dependencyPosition, { subNodeRole: dropTarget.role });
        if (newNode) {
          onConnect({
            source: newNode.id,
            sourceHandle: 'output',
            target: dropTarget.nodeId,
            targetHandle: dropTarget.role,
          } as Connection);
        }
      } else if (nearbySourceNode) {
        const newNode = addNode(
          nodeType,
          {
            x: nearbySourceNode.position.x + QUICK_ADD_NODE_OFFSET_X,
            y: nearbySourceNode.position.y,
          },
          { subNodeRole: null }
        );

        if (newNode) {
          onConnect({
            source: nearbySourceNode.id,
            sourceHandle: 'output',
            target: newNode.id,
            targetHandle: 'input',
          } as Connection);
        }
      } else {
        addNode(nodeType, position, { subNodeRole: null });
      }

      setSelectedStickyNoteId(null);
    },
    [addNode, getPaletteNodePosition, getViewport, nodes, onConnect, stickyNoteIds]
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
    closeQuickAddMenu();
    setOutputPanelNodeId(null);
    setSelectedStickyNoteId(null);
    selectNode(null);
  }, [closeQuickAddMenu, selectNode, setOutputPanelNodeId]);

  const isValidConnection = useCallback<IsValidConnection>((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return false;
    }

    const sourceNode = nodes.find((node) => node.id === connection.source);
    const targetNode = nodes.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) {
      return false;
    }

    if (isDependencyHandleId(connection.targetHandle)) {
      const sourceRole = sourceNode.data.subNodeRole ?? getSubNodeRoleForType(sourceNode.data.type, sourceNode.data.category);
      return sourceRole === connection.targetHandle && (AGENT_NODE_TYPES as readonly NodeType[]).includes(targetNode.data.type);
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

    const sourceNode = nodes.find((node) => node.id === sourceNodeId);
    const sourceRole = sourceNode ? (sourceNode.data.subNodeRole ?? getSubNodeRoleForType(sourceNode.data.type, sourceNode.data.category)) : undefined;
    const compatibleTargetNodeIds = nodes
      .filter((node) => node.id !== sourceNodeId)
      .filter((node) => !stickyNoteIds.has(node.id))
      .filter((node) => {
        if (sourceRole) {
          return (AGENT_NODE_TYPES as readonly NodeType[]).includes(node.data.type);
        }
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
        {paletteOpen && <div className="absolute inset-0 z-[25] bg-background/40 backdrop-blur-[1px]" onClick={closePalette} />}
        <NodeSearch open={nodeSearchOpen} nodes={nodes} onClose={() => setNodeSearchOpen(false)} onSelect={handleNodeSearchSelect} />

        <button
          type="button"
          onClick={() => {
            if (paletteOpen && !paletteFilterRole) {
              closePalette();
              return;
            }
            setPaletteFilterRole(undefined);
            setPaletteTargetNodeId(null);
            setPaletteOpen(true);
          }}
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
          <NodePalette
            autoFocusSearch={paletteOpen}
            filterRole={paletteFilterRole}
            onAddNode={addNodeFromPalette}
            onNodeAdded={() => closePalette()}
          />
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
            onClick={handleAutoLayout}
            className="rounded-lg border border-border bg-card p-2 shadow-md transition-colors hover:bg-accent"
            title="Auto layout"
          >
            <LayoutTemplate className="h-4 w-4" />
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
          edges={displayEdges}
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
          edgeTypes={edgeTypes}
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

        {quickAddSource && (
          <QuickAddMenu
            x={quickAddSource.x}
            y={quickAddSource.y}
            onSelect={handleQuickAddNode}
            onClose={closeQuickAddMenu}
          />
        )}

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
