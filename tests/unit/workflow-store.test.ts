import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkflowStore } from '@/lib/stores/workflow-store';
import { NodeType } from '@/types/nodes';

describe('Workflow Store', () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      nodes: [],
      edges: [],
      selectedNode: null,
      workflowId: null,
      workflowName: 'Untitled Workflow',
      workflowDescription: '',
      workflowVariables: [],
      workflowEnvVars: [],
      isPanelOpen: true,
      history: [{ nodes: [], edges: [], stickyNotes: [], selectedNodeId: null }],
      historyIndex: 0,
    });
  });

  describe('initial state', () => {
    it('should have empty nodes array', () => {
      const { nodes } = useWorkflowStore.getState();
      expect(nodes).toEqual([]);
    });

    it('should have empty edges array', () => {
      const { edges } = useWorkflowStore.getState();
      expect(edges).toEqual([]);
    });

    it('should have default workflow name', () => {
      const { workflowName } = useWorkflowStore.getState();
      expect(workflowName).toBe('Untitled Workflow');
    });
  });

  describe('addNode', () => {
    it('should add a node to the workflow', () => {
      const { addNode } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });

      const currentNodes = useWorkflowStore.getState().nodes;
      expect(currentNodes.length).toBe(1);
      expect(currentNodes[0].type).toBe('custom');
      expect(currentNodes[0].data.type).toBe(NodeType.TRIGGER_MANUAL);
    });

    it('should set node position correctly', () => {
      const { addNode } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 250, y: 150 });

      const currentNodes = useWorkflowStore.getState().nodes;
      expect(currentNodes[0].position).toEqual({ x: 250, y: 150 });
    });

    it('should find smart empty space when no position is provided', () => {
      const { addNode } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL);
      addNode(NodeType.AI_CHAT);

      const currentNodes = useWorkflowStore.getState().nodes;
      expect(currentNodes[0].position).toEqual({ x: 300, y: 200 });
      expect(currentNodes[1].position).toEqual({ x: 560, y: 200 });
    });

    it('should select newly added node', () => {
      const { addNode } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });

      const { selectedNode } = useWorkflowStore.getState();
      expect(selectedNode).not.toBeNull();
      expect(selectedNode?.data.type).toBe(NodeType.TRIGGER_MANUAL);
    });

    it('should open config panel when adding node', () => {
      const { addNode, setIsPanelOpen } = useWorkflowStore.getState();

      setIsPanelOpen(false);
      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });

      const { isPanelOpen } = useWorkflowStore.getState();
      expect(isPanelOpen).toBe(true);
    });
  });

  describe('history', () => {
    it('should undo and redo node creation', () => {
      const { addNode, undo, redo } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });
      expect(useWorkflowStore.getState().nodes).toHaveLength(1);

      undo();
      expect(useWorkflowStore.getState().nodes).toHaveLength(0);

      redo();
      expect(useWorkflowStore.getState().nodes).toHaveLength(1);
    });
  });

  describe('duplicateNode', () => {
    it('should duplicate a node with an offset position', () => {
      const { addNode, duplicateNode } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });
      const originalNode = useWorkflowStore.getState().nodes[0];

      duplicateNode(originalNode.id);

      const { nodes, selectedNode } = useWorkflowStore.getState();
      expect(nodes).toHaveLength(2);
      expect(nodes[1].id).not.toBe(originalNode.id);
      expect(nodes[1].position).toEqual({ x: 140, y: 140 });
      expect(nodes[1].data).toEqual(originalNode.data);
      expect(selectedNode?.id).toBe(nodes[1].id);
    });
  });

  describe('updateNodeData', () => {
    it('should update node data', () => {
      const { addNode, updateNodeData } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      updateNodeData(nodeId, {
        config: { label: 'Updated Label' },
      });

      const updatedNode = useWorkflowStore.getState().nodes[0];
      expect(updatedNode.data.config.label).toBe('Updated Label');
    });

    it('should update selected node if its the one being updated', () => {
      const { addNode, updateNodeData } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      updateNodeData(nodeId, {
        config: { label: 'Test' },
      });

      const { selectedNode } = useWorkflowStore.getState();
      expect(selectedNode?.data.config.label).toBe('Test');
    });
  });

  describe('deleteNode', () => {
    it('should delete a node', () => {
      const { addNode, deleteNode } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      deleteNode(nodeId);

      const { nodes } = useWorkflowStore.getState();
      expect(nodes.length).toBe(0);
    });

    it('should deselect node when deleting selected node', () => {
      const { addNode, deleteNode } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });
      const nodeId = useWorkflowStore.getState().nodes[0].id;

      deleteNode(nodeId);

      const { selectedNode } = useWorkflowStore.getState();
      expect(selectedNode).toBeNull();
    });
  });

  describe('sticky notes', () => {
    it('should add, update, and delete sticky notes', () => {
      const { addStickyNote, updateStickyNote, deleteStickyNote } = useWorkflowStore.getState();

      addStickyNote({
        id: 'sticky-1',
        x: 40,
        y: 60,
        width: 240,
        height: 180,
        content: 'Initial note',
        color: 'yellow',
      });

      expect(useWorkflowStore.getState().stickyNotes).toHaveLength(1);

      updateStickyNote('sticky-1', { content: 'Updated note', color: 'blue' });

      expect(useWorkflowStore.getState().stickyNotes[0]).toMatchObject({
        content: 'Updated note',
        color: 'blue',
      });

      deleteStickyNote('sticky-1');

      expect(useWorkflowStore.getState().stickyNotes).toEqual([]);
    });
  });

  describe('workflow metadata', () => {
    it('should update workflow name', () => {
      const { setWorkflowName } = useWorkflowStore.getState();

      setWorkflowName('My Workflow');

      const { workflowName } = useWorkflowStore.getState();
      expect(workflowName).toBe('My Workflow');
    });

    it('should update workflow description', () => {
      const { setWorkflowDescription } = useWorkflowStore.getState();

      setWorkflowDescription('Test description');

      const { workflowDescription } = useWorkflowStore.getState();
      expect(workflowDescription).toBe('Test description');
    });
  });

  describe('getWorkflowDefinition', () => {
    it('should return complete workflow definition', () => {
      const { addNode, addStickyNote, setWorkflowName, setWorkflowDescription, getWorkflowDefinition } =
        useWorkflowStore.getState();

      setWorkflowName('Test Workflow');
      setWorkflowDescription('Test Description');
      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });
      addStickyNote({
        id: 'sticky-1',
        x: 20,
        y: 30,
        width: 240,
        height: 180,
        content: 'Remember to validate input',
        color: 'yellow',
      });

      const definition = getWorkflowDefinition();

      expect(definition.metadata?.name).toBe('Test Workflow');
      expect(definition.metadata?.description).toBe('Test Description');
      expect(definition.nodes.length).toBe(1);
      expect(definition.edges.length).toBe(0);
      expect(definition.stickyNotes).toHaveLength(1);
    });
  });

  describe('clearWorkflow', () => {
    it('should clear all workflow data', () => {
      const { addNode, setWorkflowName, clearWorkflow } = useWorkflowStore.getState();

      addNode(NodeType.TRIGGER_MANUAL, { x: 100, y: 100 });
      setWorkflowName('Test');

      clearWorkflow();

      const state = useWorkflowStore.getState();
      expect(state.nodes).toEqual([]);
      expect(state.edges).toEqual([]);
      expect(state.workflowName).toBe('Untitled Workflow');
      expect(state.selectedNode).toBeNull();
      expect(state.historyIndex).toBe(0);
    });
  });
});
