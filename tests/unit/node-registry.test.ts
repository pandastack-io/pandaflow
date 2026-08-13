import { describe, it, expect } from 'vitest';
import { nodeRegistry, getNodesByCategory, getNodeByType } from '@/lib/nodes/registry';
import { NodeType, NodeCategory } from '@/types/nodes';

describe('Node Registry', () => {
  describe('nodeRegistry', () => {
    it('should contain all defined node types', () => {
      expect(Object.keys(nodeRegistry).length).toBeGreaterThan(0);
    });

    it('should have valid structure for each node', () => {
      Object.values(nodeRegistry).forEach((node) => {
        expect(node).toHaveProperty('type');
        expect(node).toHaveProperty('category');
        expect(node).toHaveProperty('name');
        expect(node).toHaveProperty('description');
        expect(node).toHaveProperty('icon');
        expect(node).toHaveProperty('color');
        expect(node).toHaveProperty('configSchema');
        expect(node).toHaveProperty('defaultConfig');
        expect(node).toHaveProperty('inputs');
        expect(node).toHaveProperty('outputs');
      });
    });

    it('should have valid Zod schemas', () => {
      Object.values(nodeRegistry).forEach((node) => {
        expect(node.configSchema).toBeDefined();
        expect(typeof node.configSchema.parse).toBe('function');
      });
    });
  });

  describe('getNodesByCategory', () => {
    it('should return nodes for TRIGGER category', () => {
      const triggerNodes = getNodesByCategory(NodeCategory.TRIGGER);

      expect(triggerNodes.length).toBeGreaterThan(0);
      triggerNodes.forEach((node) => {
        expect(node.category).toBe(NodeCategory.TRIGGER);
      });
    });

    it('should return nodes for PANDASTACK category', () => {
      const pandastackNodes = getNodesByCategory(NodeCategory.PANDASTACK);

      expect(pandastackNodes.length).toBeGreaterThan(0);
      pandastackNodes.forEach((node) => {
        expect(node.category).toBe(NodeCategory.PANDASTACK);
      });
    });

    it('should return nodes for AI category', () => {
      const aiNodes = getNodesByCategory(NodeCategory.AI);

      expect(aiNodes.length).toBeGreaterThan(0);
      aiNodes.forEach((node) => {
        expect(node.category).toBe(NodeCategory.AI);
      });
    });

    it('should return nodes for RAG category', () => {
      const ragNodes = getNodesByCategory(NodeCategory.RAG);

      expect(ragNodes.length).toBeGreaterThan(0);
      ragNodes.forEach((node) => {
        expect(node.category).toBe(NodeCategory.RAG);
      });
    });

    it('should return empty array for invalid category', () => {
      const nodes = getNodesByCategory('invalid' as NodeCategory);
      expect(nodes).toEqual([]);
    });
  });

  describe('getNodeByType', () => {
    it('should return node for TRIGGER_MANUAL type', () => {
      const node = getNodeByType(NodeType.TRIGGER_MANUAL);

      expect(node).toBeDefined();
      expect(node?.type).toBe(NodeType.TRIGGER_MANUAL);
      expect(node?.category).toBe(NodeCategory.TRIGGER);
    });

    it('should return node for PANDASTACK_EXECUTE type', () => {
      const node = getNodeByType(NodeType.PANDASTACK_EXECUTE);

      expect(node).toBeDefined();
      expect(node?.type).toBe(NodeType.PANDASTACK_EXECUTE);
      expect(node?.category).toBe(NodeCategory.PANDASTACK);
    });

    it('should return node for AI_LLM type', () => {
      const node = getNodeByType(NodeType.AI_LLM);

      expect(node).toBeDefined();
      expect(node?.type).toBe(NodeType.AI_LLM);
      expect(node?.category).toBe(NodeCategory.AI);
    });

    it('should return node for RAG_QA_CHAIN type', () => {
      const node = getNodeByType(NodeType.RAG_QA_CHAIN);

      expect(node).toBeDefined();
      expect(node?.type).toBe(NodeType.RAG_QA_CHAIN);
      expect(node?.category).toBe(NodeCategory.RAG);
    });

    it('should return node for HUMAN_APPROVAL type', () => {
      const node = getNodeByType(NodeType.HUMAN_APPROVAL);

      expect(node).toBeDefined();
      expect(node?.type).toBe(NodeType.HUMAN_APPROVAL);
      expect(node?.category).toBe(NodeCategory.CONTROL);
      expect(node?.outputs.map((output) => output.name)).toEqual(['approved', 'rejected']);
    });

    it('should return undefined for invalid type', () => {
      const node = getNodeByType('invalid.type' as NodeType);
      expect(node).toBeUndefined();
    });
  });

  describe('Node Configuration Validation', () => {
    it('should validate Manual Trigger config', () => {
      const node = getNodeByType(NodeType.TRIGGER_MANUAL);
      const validConfig = {};

      expect(() => node?.configSchema.parse(validConfig)).not.toThrow();
    });

    it('should validate PandaStack Execute config', () => {
      const node = getNodeByType(NodeType.PANDASTACK_EXECUTE);
      const validConfig = {
        language: 'python',
        code: 'print("hello")',
      };

      expect(() => node?.configSchema.parse(validConfig)).not.toThrow();
    });

    it('should reject invalid PandaStack Execute config', () => {
      const node = getNodeByType(NodeType.PANDASTACK_EXECUTE);
      const invalidConfig = {
        language: 'invalid',
        code: '',
      };

      expect(() => node?.configSchema.parse(invalidConfig)).toThrow();
    });

    it('should validate LLM config', () => {
      const node = getNodeByType(NodeType.AI_LLM);
      const validConfig = {
        provider: 'openai',
        model: 'gpt-4',
        prompt: 'Test prompt',
      };

      expect(() => node?.configSchema.parse(validConfig)).not.toThrow();
    });

    it('should reject invalid LLM config', () => {
      const node = getNodeByType(NodeType.AI_LLM);
      const invalidConfig = {
        provider: 'openai',
        model: '',
        prompt: '',
      };

      expect(() => node?.configSchema.parse(invalidConfig)).toThrow();
    });

    it('should validate RAG splitter config', () => {
      const node = getNodeByType(NodeType.RAG_TEXT_SPLITTER);
      const validConfig = {
        strategy: 'recursive',
        chunkSize: 1200,
        chunkOverlap: 200,
      };

      expect(() => node?.configSchema.parse(validConfig)).not.toThrow();
    });
  });

  describe('Default Configurations', () => {
    it('should have valid default config for PandaStack Execute', () => {
      const node = getNodeByType(NodeType.PANDASTACK_EXECUTE);

      expect(node?.defaultConfig.language).toBe('python');
      expect(node?.defaultConfig.code).toBeDefined();
      expect(node?.defaultConfig.timeout).toBe(30000);
    });

    it('should have valid default config for LLM', () => {
      const node = getNodeByType(NodeType.AI_LLM);

      expect(node?.defaultConfig.provider).toBe('openai');
      expect(node?.defaultConfig.temperature).toBe(0.7);
    });
  });
});
