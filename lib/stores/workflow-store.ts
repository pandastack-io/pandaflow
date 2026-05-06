import { create } from 'zustand';
import {
  Node,
  Edge,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
} from 'reactflow';
import {
  WorkflowNodeData,
  WorkflowDefinition,
  WorkflowEnvVar,
  WorkflowVariable,
  NodeType,
  NodeExecutionOutput,
  StickyNote,
} from '@/types/nodes';
import { getNodeByType } from '@/lib/nodes/registry';

interface WorkflowHistoryEntry {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  stickyNotes: StickyNote[];
  selectedNodeId: string | null;
}

export interface WorkflowExecutionSummary {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  duration?: number;
  startedAt?: number;
  completedAt?: number;
}

interface ConnectionPreviewState {
  active: boolean;
  sourceNodeId: string | null;
  compatibleTargetNodeIds: string[];
}

const createHistoryEntry = (
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  stickyNotes: StickyNote[],
  selectedNodeId: string | null
): WorkflowHistoryEntry => structuredClone({ nodes, edges, stickyNotes, selectedNodeId });

const createInitialHistory = (): WorkflowHistoryEntry =>
  createHistoryEntry([], [], [], null);

const findSelectedNode = (
  nodes: Node<WorkflowNodeData>[],
  selectedNodeId: string | null
) => (selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null);

const areHistoryEntriesEqual = (
  left: WorkflowHistoryEntry | undefined,
  right: WorkflowHistoryEntry
) => {
  if (!left) {
    return false;
  }

  return JSON.stringify(left) === JSON.stringify(right);
};

interface WorkflowStore {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  stickyNotes: StickyNote[];
  selectedNode: Node<WorkflowNodeData> | null;
  history: WorkflowHistoryEntry[];
  historyIndex: number;

  workflowId: string | null;
  workflowName: string;
  workflowDescription: string;
  workflowVariables: WorkflowVariable[];
  workflowEnvVars: WorkflowEnvVar[];

  isPanelOpen: boolean;
  outputPanelNodeId: string | null;
  executionOutputs: Record<string, NodeExecutionOutput>;
  activeExecutionId: string | null;
  executionNodeSummaries: WorkflowExecutionSummary[];
  connectionPreview: ConnectionPreviewState;
  debugMode: boolean;
  debugPausedAtNode: string | null;

  setNodes: (nodes: Node<WorkflowNodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  addNode: (type: NodeType, position?: { x: number; y: number }) => void;
  duplicateNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  deleteSelectedElements: () => void;
  selectNode: (nodeId: string | null) => void;

  addStickyNote: (note: StickyNote) => void;
  updateStickyNote: (id: string, partial: Partial<StickyNote>) => void;
  deleteStickyNote: (id: string) => void;

  setWorkflowName: (name: string) => void;
  setWorkflowDescription: (description: string) => void;
  setWorkflowVariables: (variables: WorkflowVariable[]) => void;
  setWorkflowEnvVars: (envVars: WorkflowEnvVar[]) => void;
  loadWorkflow: (definition: WorkflowDefinition) => void;
  getWorkflowDefinition: () => WorkflowDefinition;
  clearWorkflow: () => void;
  resetWorkflow: () => void;

  togglePanel: () => void;
  setIsPanelOpen: (isOpen: boolean) => void;
  setOutputPanelNodeId: (nodeId: string | null) => void;
  setExecutionOutputs: (outputs: Record<string, NodeExecutionOutput>) => void;
  setExecutionContext: (executionId: string | null, nodeSummaries: WorkflowExecutionSummary[]) => void;
  setConnectionPreview: (preview: ConnectionPreviewState) => void;
  clearConnectionPreview: () => void;
  clearExecutionOutputs: () => void;
  setDebugMode: (enabled: boolean) => void;
  setDebugPausedAtNode: (nodeId: string | null) => void;
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  stickyNotes: [],
  selectedNode: null,
  history: [createInitialHistory()],
  historyIndex: 0,
  workflowId: null,
  workflowName: 'Untitled Workflow',
  workflowDescription: '',
  workflowVariables: [],
  workflowEnvVars: [],
  isPanelOpen: true,
  outputPanelNodeId: null,
  executionOutputs: {},
  activeExecutionId: null,
  executionNodeSummaries: [],
  connectionPreview: { active: false, sourceNodeId: null, compatibleTargetNodeIds: [] },
  debugMode: false,
  debugPausedAtNode: null,

  setNodes: (nodes) => {
    const selectedNode = findSelectedNode(nodes, get().selectedNode?.id ?? null);
    const snapshot = createHistoryEntry(
      nodes,
      get().edges,
      get().stickyNotes,
      selectedNode?.id ?? null
    );

    set((state) => ({
      nodes,
      selectedNode,
      outputPanelNodeId:
        state.outputPanelNodeId && !nodes.some((node) => node.id === state.outputPanelNodeId)
          ? null
          : state.outputPanelNodeId,
      history: [snapshot],
      historyIndex: 0,
    }));
  },
  setEdges: (edges) => {
    const snapshot = createHistoryEntry(
      get().nodes,
      edges,
      get().stickyNotes,
      get().selectedNode?.id ?? null
    );

    set({
      edges,
      history: [snapshot],
      historyIndex: 0,
    });
  },

  onNodesChange: (changes) => {
    const shouldTrackHistory = changes.some(
      (change) =>
        change.type === 'remove' ||
        (change.type === 'position' && 'dragging' in change && !change.dragging)
    );

    if (shouldTrackHistory) {
      get().pushHistory();
    }

    const nextNodes = applyNodeChanges(changes, get().nodes) as Node<WorkflowNodeData>[];
    let nextSelectedNodeId = get().selectedNode?.id ?? null;

    for (const change of changes) {
      if (change.type === 'remove' && change.id === nextSelectedNodeId) {
        nextSelectedNodeId = null;
      }

      if (change.type === 'select') {
        if (change.selected) {
          nextSelectedNodeId = change.id;
        } else if (change.id === nextSelectedNodeId) {
          nextSelectedNodeId = null;
        }
      }
    }

    const selectedNode = findSelectedNode(nextNodes, nextSelectedNodeId);

    set((state) => ({
      nodes: nextNodes,
      selectedNode,
      isPanelOpen: selectedNode ? state.isPanelOpen : false,
      outputPanelNodeId:
        state.outputPanelNodeId && !nextNodes.some((node) => node.id === state.outputPanelNodeId)
          ? null
          : state.outputPanelNodeId,
    }));

    if (shouldTrackHistory) {
      get().pushHistory();
    }
  },

  onEdgesChange: (changes) => {
    const shouldTrackHistory = changes.some((change) => change.type === 'remove');

    if (shouldTrackHistory) {
      get().pushHistory();
    }

    set({
      edges: applyEdgeChanges(changes, get().edges),
    });

    if (shouldTrackHistory) {
      get().pushHistory();
    }
  },

  onConnect: (connection) => {
    get().pushHistory();

    set({
      edges: addEdge(connection, get().edges),
    });

    get().pushHistory();
  },

  pushHistory: () => {
    const state = get();
    const snapshot = createHistoryEntry(
      state.nodes,
      state.edges,
      state.stickyNotes,
      state.selectedNode?.id ?? null
    );
    const trimmedHistory = state.history.slice(0, state.historyIndex + 1);

    if (areHistoryEntriesEqual(trimmedHistory[trimmedHistory.length - 1], snapshot)) {
      return;
    }

    set({
      history: [...trimmedHistory, snapshot],
      historyIndex: trimmedHistory.length,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();

    if (historyIndex <= 0) {
      return;
    }

    const previousSnapshot = history[historyIndex - 1];
    const nodes = structuredClone(previousSnapshot.nodes);
    const edges = structuredClone(previousSnapshot.edges);
    const stickyNotes = structuredClone(previousSnapshot.stickyNotes);
    const selectedNode = findSelectedNode(nodes, previousSnapshot.selectedNodeId);

    set((state) => ({
      nodes,
      edges,
      stickyNotes,
      selectedNode,
      historyIndex: historyIndex - 1,
      isPanelOpen: !!selectedNode,
      outputPanelNodeId:
        state.outputPanelNodeId && !nodes.some((node) => node.id === state.outputPanelNodeId)
          ? null
          : state.outputPanelNodeId,
    }));
  },

  redo: () => {
    const { history, historyIndex } = get();

    if (historyIndex >= history.length - 1) {
      return;
    }

    const nextSnapshot = history[historyIndex + 1];
    const nodes = structuredClone(nextSnapshot.nodes);
    const edges = structuredClone(nextSnapshot.edges);
    const stickyNotes = structuredClone(nextSnapshot.stickyNotes);
    const selectedNode = findSelectedNode(nodes, nextSnapshot.selectedNodeId);

    set((state) => ({
      nodes,
      edges,
      stickyNotes,
      selectedNode,
      historyIndex: historyIndex + 1,
      isPanelOpen: !!selectedNode,
      outputPanelNodeId:
        state.outputPanelNodeId && !nodes.some((node) => node.id === state.outputPanelNodeId)
          ? null
          : state.outputPanelNodeId,
    }));
  },

  addNode: (type, position) => {
    const nodeInfo = getNodeByType(type);
    if (!nodeInfo) return;

    const existingNodes = get().nodes;

    let finalPosition = position;
    if (!finalPosition) {
      const NODE_WIDTH = 220;
      const NODE_HEIGHT = 100;
      const PADDING = 40;

      let candidate = { x: 300, y: 200 };
      let attempts = 0;

      while (attempts < 50) {
        const overlaps = existingNodes.some(
          (node) =>
            Math.abs(node.position.x - candidate.x) < NODE_WIDTH + PADDING &&
            Math.abs(node.position.y - candidate.y) < NODE_HEIGHT + PADDING
        );

        if (!overlaps) {
          break;
        }

        candidate = {
          x: candidate.x + NODE_WIDTH + PADDING,
          y: candidate.y,
        };

        if (candidate.x > 1200) {
          candidate = {
            x: 300,
            y: candidate.y + NODE_HEIGHT + PADDING,
          };
        }

        attempts += 1;
      }

      finalPosition = candidate;
    }

    get().pushHistory();

    const newNode: Node<WorkflowNodeData> = {
      id: crypto.randomUUID(),
      type: 'custom',
      position: finalPosition,
      data: {
        type,
        category: nodeInfo.category,
        config: nodeInfo.defaultConfig,
        status: 'idle',
      },
    };

    set({
      nodes: [...get().nodes, newNode],
      selectedNode: newNode,
      isPanelOpen: true,
      outputPanelNodeId: null,
    });

    get().pushHistory();
  },

  duplicateNode: (nodeId) => {
    const sourceNode = get().nodes.find((node) => node.id === nodeId);

    if (!sourceNode) {
      return;
    }

    get().pushHistory();

    const duplicatedNode: Node<WorkflowNodeData> = {
      ...structuredClone(sourceNode),
      id: crypto.randomUUID(),
      position: {
        x: sourceNode.position.x + 40,
        y: sourceNode.position.y + 40,
      },
      selected: true,
    };

    set((state) => ({
      nodes: [...state.nodes.map((node) => ({ ...node, selected: false })), duplicatedNode],
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNode: duplicatedNode,
      isPanelOpen: true,
      outputPanelNodeId: null,
    }));

    get().pushHistory();
  },

  updateNodeData: (nodeId, data) => {
    const nextNodes = get().nodes.map((node) =>
      node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
    ) as Node<WorkflowNodeData>[];

    const selectedNode = findSelectedNode(nextNodes, get().selectedNode?.id ?? null);

    set({
      nodes: nextNodes,
      selectedNode,
    });
  },

  deleteNode: (nodeId) => {
    get().pushHistory();

    const nextNodes = get().nodes.filter((node) => node.id !== nodeId);
    const nextEdges = get().edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId
    );
    const selectedNode =
      get().selectedNode?.id === nodeId
        ? null
        : findSelectedNode(nextNodes, get().selectedNode?.id ?? null);

    set((state) => ({
      nodes: nextNodes,
      edges: nextEdges,
      selectedNode,
      isPanelOpen: !!selectedNode,
      outputPanelNodeId: state.outputPanelNodeId === nodeId ? null : state.outputPanelNodeId,
      executionOutputs: Object.fromEntries(
        Object.entries(state.executionOutputs).filter(([key]) => key !== nodeId)
      ),
      executionNodeSummaries: state.executionNodeSummaries.filter((summary) => summary.nodeId !== nodeId),
      connectionPreview:
        state.connectionPreview.sourceNodeId === nodeId || state.connectionPreview.compatibleTargetNodeIds.includes(nodeId)
          ? { active: false, sourceNodeId: null, compatibleTargetNodeIds: [] }
          : state.connectionPreview,
      debugPausedAtNode: state.debugPausedAtNode === nodeId ? null : state.debugPausedAtNode,
    }));

    get().pushHistory();
  },

  deleteSelectedElements: () => {
    const state = get();
    const selectedNodeIds = new Set(state.nodes.filter((node) => node.selected).map((node) => node.id));
    const selectedEdgeIds = new Set(state.edges.filter((edge) => edge.selected).map((edge) => edge.id));

    if (state.selectedNode?.id) {
      selectedNodeIds.add(state.selectedNode.id);
    }

    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) {
      return;
    }

    state.pushHistory();

    const nextNodes = state.nodes.filter((node) => !selectedNodeIds.has(node.id));
    const nextEdges = state.edges.filter(
      (edge) =>
        !selectedEdgeIds.has(edge.id) &&
        !selectedNodeIds.has(edge.source) &&
        !selectedNodeIds.has(edge.target)
    );
    const selectedNode =
      state.selectedNode && !selectedNodeIds.has(state.selectedNode.id)
        ? findSelectedNode(nextNodes, state.selectedNode.id)
        : null;

    set((currentState) => ({
      nodes: nextNodes,
      edges: nextEdges,
      selectedNode,
      isPanelOpen: !!selectedNode,
      outputPanelNodeId:
        currentState.outputPanelNodeId && selectedNodeIds.has(currentState.outputPanelNodeId)
          ? null
          : currentState.outputPanelNodeId,
      executionOutputs: Object.fromEntries(
        Object.entries(currentState.executionOutputs).filter(([key]) => !selectedNodeIds.has(key))
      ),
      executionNodeSummaries: currentState.executionNodeSummaries.filter((summary) => !selectedNodeIds.has(summary.nodeId)),
      connectionPreview:
        currentState.connectionPreview.sourceNodeId && selectedNodeIds.has(currentState.connectionPreview.sourceNodeId)
          ? { active: false, sourceNodeId: null, compatibleTargetNodeIds: [] }
          : {
              ...currentState.connectionPreview,
              compatibleTargetNodeIds: currentState.connectionPreview.compatibleTargetNodeIds.filter((nodeId) => !selectedNodeIds.has(nodeId)),
            },
      debugPausedAtNode:
        currentState.debugPausedAtNode && selectedNodeIds.has(currentState.debugPausedAtNode)
          ? null
          : currentState.debugPausedAtNode,
    }));

    state.pushHistory();
  },

  selectNode: (nodeId) => {
    if (!nodeId) {
      set((state) => ({
        nodes: state.nodes.map((node) => ({ ...node, selected: false })),
        edges: state.edges.map((edge) => ({ ...edge, selected: false })),
        selectedNode: null,
        outputPanelNodeId: null,
        isPanelOpen: false,
      }));
      return;
    }

    const node = get().nodes.find((n) => n.id === nodeId) ?? null;
    set((state) => ({
      nodes: state.nodes.map((currentNode) => ({
        ...currentNode,
        selected: currentNode.id === nodeId,
      })),
      edges: state.edges.map((edge) => ({ ...edge, selected: false })),
      selectedNode: node,
      isPanelOpen: !!node,
    }));
  },

  addStickyNote: (note) => {
    get().pushHistory();

    set({
      stickyNotes: [...get().stickyNotes, note],
      selectedNode: null,
      isPanelOpen: false,
      outputPanelNodeId: null,
    });

    get().pushHistory();
  },

  updateStickyNote: (id, partial) => {
    set({
      stickyNotes: get().stickyNotes.map((note) =>
        note.id === id ? { ...note, ...partial, id: note.id } : note
      ),
    });
  },

  deleteStickyNote: (id) => {
    set({
      stickyNotes: get().stickyNotes.filter((note) => note.id !== id),
    });
  },

  setWorkflowName: (name) => set({ workflowName: name }),
  setWorkflowDescription: (description) => set({ workflowDescription: description }),
  setWorkflowVariables: (workflowVariables) => set({ workflowVariables }),
  setWorkflowEnvVars: (workflowEnvVars) => set({ workflowEnvVars }),

  loadWorkflow: (definition) => {
    const stickyNotes = definition.stickyNotes || [];
    const snapshot = createHistoryEntry(definition.nodes, definition.edges, stickyNotes, null);

    set({
      nodes: definition.nodes,
      edges: definition.edges,
      stickyNotes,
      workflowName: definition.metadata?.name || 'Untitled Workflow',
      workflowDescription: definition.metadata?.description || '',
      workflowVariables: definition.variables || [],
      workflowEnvVars: definition.envVars || [],
      selectedNode: null,
      isPanelOpen: false,
      history: [snapshot],
      historyIndex: 0,
      outputPanelNodeId: null,
      executionOutputs: {},
      activeExecutionId: null,
      executionNodeSummaries: [],
      connectionPreview: { active: false, sourceNodeId: null, compatibleTargetNodeIds: [] },
      debugPausedAtNode: null,
    });
  },

  getWorkflowDefinition: (): WorkflowDefinition => {
    const state = get();
    return {
      nodes: state.nodes,
      edges: state.edges,
      stickyNotes: state.stickyNotes,
      variables: state.workflowVariables,
      envVars: state.workflowEnvVars,
      metadata: {
        name: state.workflowName,
        description: state.workflowDescription,
        version: '1.0.0',
      },
    };
  },

  clearWorkflow: () => {
    set({
      nodes: [],
      edges: [],
      stickyNotes: [],
      selectedNode: null,
      workflowName: 'Untitled Workflow',
      workflowDescription: '',
      workflowVariables: [],
      workflowEnvVars: [],
      workflowId: null,
      isPanelOpen: false,
      history: [createInitialHistory()],
      historyIndex: 0,
      outputPanelNodeId: null,
      executionOutputs: {},
      activeExecutionId: null,
      executionNodeSummaries: [],
      connectionPreview: { active: false, sourceNodeId: null, compatibleTargetNodeIds: [] },
      debugPausedAtNode: null,
    });
  },

  resetWorkflow: () => {
    get().clearWorkflow();
  },

  togglePanel: () => set({ isPanelOpen: !get().isPanelOpen }),
  setIsPanelOpen: (isOpen) => set({ isPanelOpen: isOpen }),
  setOutputPanelNodeId: (nodeId) => set({ outputPanelNodeId: nodeId }),
  setExecutionOutputs: (executionOutputs) => set({ executionOutputs }),
  setExecutionContext: (executionId, executionNodeSummaries) => set({ activeExecutionId: executionId, executionNodeSummaries }),
  setConnectionPreview: (connectionPreview) => set({ connectionPreview }),
  clearConnectionPreview: () => set({ connectionPreview: { active: false, sourceNodeId: null, compatibleTargetNodeIds: [] } }),
  clearExecutionOutputs: () =>
    set({
      executionOutputs: {},
      activeExecutionId: null,
      executionNodeSummaries: [],
      connectionPreview: { active: false, sourceNodeId: null, compatibleTargetNodeIds: [] },
      outputPanelNodeId: null,
      debugPausedAtNode: null,
    }),
  setDebugMode: (enabled) => set({ debugMode: enabled }),
  setDebugPausedAtNode: (nodeId) => set({ debugPausedAtNode: nodeId }),
}));
