/**
 * Example Workflow Integration Tests
 *
 * This file demonstrates how to use the test workflow definitions
 * in automated integration tests.
 *
 * Run with: npm test tests/test-workflows/example-workflow-tests.spec.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { workflowTestHelper, TEST_CASES } from './workflow-test-helper';
import { WorkflowDefinition } from '@/types/nodes';

describe('Test Workflow Definitions', () => {
  describe('Workflow Structure Validation', () => {
    it('should load all test workflows successfully', () => {
      const workflows = workflowTestHelper.loadAllWorkflows();

      expect(workflows.scraping).toBeDefined();
      expect(workflows.codeExecution).toBeDefined();
      expect(workflows.conditional).toBeDefined();
      expect(workflows.loop).toBeDefined();
    });

    it('should validate simple scraping workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('1-simple-scraping-workflow.json');
      const validation = workflowTestHelper.validateWorkflow(workflow);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should validate code execution workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('2-code-execution-workflow.json');
      const validation = workflowTestHelper.validateWorkflow(workflow);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should validate conditional workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('3-conditional-workflow.json');
      const validation = workflowTestHelper.validateWorkflow(workflow);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should validate loop workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('4-loop-workflow.json');
      const validation = workflowTestHelper.validateWorkflow(workflow);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Workflow Statistics', () => {
    it('should report correct stats for simple scraping workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('1-simple-scraping-workflow.json');
      const stats = workflowTestHelper.getWorkflowStats(workflow);

      expect(stats.totalNodes).toBe(3);
      expect(stats.totalEdges).toBe(2);
      expect(stats.hasTrigger).toBe(true);
      expect(stats.nodesByCategory.trigger).toBe(1);
      expect(stats.nodesByCategory.sandflare).toBe(1);
      expect(stats.nodesByCategory.integration).toBe(1);
    });

    it('should report correct stats for code execution workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('2-code-execution-workflow.json');
      const stats = workflowTestHelper.getWorkflowStats(workflow);

      expect(stats.totalNodes).toBe(4);
      expect(stats.totalEdges).toBe(3);
      expect(stats.hasTrigger).toBe(true);
      expect(stats.hasOutput).toBe(true);
      expect(stats.nodesByCategory.sandflare).toBe(1);
      expect(stats.nodesByCategory.utility).toBe(1);
    });

    it('should report correct stats for conditional workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('3-conditional-workflow.json');
      const stats = workflowTestHelper.getWorkflowStats(workflow);

      expect(stats.totalNodes).toBe(8);
      expect(stats.totalEdges).toBe(7);
      expect(stats.hasCondition).toBe(true);
      expect(stats.nodesByCategory.control).toBe(1);
      expect(stats.nodesByCategory.output).toBe(2);
    });

    it('should report correct stats for loop workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('4-loop-workflow.json');
      const stats = workflowTestHelper.getWorkflowStats(workflow);

      expect(stats.totalNodes).toBe(8);
      expect(stats.totalEdges).toBe(7);
      expect(stats.hasLoop).toBe(true);
      expect(stats.nodesByCategory.control).toBe(1);
      expect(stats.nodesByCategory.transform).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Custom Validation Rules', () => {
    it('should pass all validation rules for scraping workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('1-simple-scraping-workflow.json');
      const testCase = TEST_CASES.scraping;
      const results = workflowTestHelper.runValidationRules(
        workflow,
        testCase.validationRules!
      );

      results.forEach((result) => {
        expect(result.passed).toBe(true);
      });
    });

    it('should pass all validation rules for code execution workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('2-code-execution-workflow.json');
      const testCase = TEST_CASES.codeExecution;
      const results = workflowTestHelper.runValidationRules(
        workflow,
        testCase.validationRules!
      );

      results.forEach((result) => {
        expect(result.passed).toBe(true);
      });
    });

    it('should pass all validation rules for conditional workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('3-conditional-workflow.json');
      const testCase = TEST_CASES.conditional;
      const results = workflowTestHelper.runValidationRules(
        workflow,
        testCase.validationRules!
      );

      results.forEach((result) => {
        expect(result.passed).toBe(true);
      });
    });

    it('should pass all validation rules for loop workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('4-loop-workflow.json');
      const testCase = TEST_CASES.loop;
      const results = workflowTestHelper.runValidationRules(
        workflow,
        testCase.validationRules!
      );

      results.forEach((result) => {
        expect(result.passed).toBe(true);
      });
    });
  });

  describe('Node Configuration Validation', () => {
    it('should have valid scraper configuration', () => {
      const workflow = workflowTestHelper.loadWorkflow('1-simple-scraping-workflow.json');
      const scraperNode = workflow.nodes.find((n) => n.data.type === 'sandflare.scrape');

      expect(scraperNode).toBeDefined();
      expect(scraperNode!.data.config.url).toBe('https://example.com');
      expect(scraperNode!.data.config.javascript).toBe(false);
      expect(scraperNode!.data.config.extractionRules).toBeDefined();
    });

    it('should have valid Python code in execution workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('2-code-execution-workflow.json');
      const executeNode = workflow.nodes.find((n) => n.data.type === 'sandflare.execute');

      expect(executeNode).toBeDefined();
      expect(executeNode!.data.config.language).toBe('python');
      expect(executeNode!.data.config.code).toContain('statistics');
      expect(executeNode!.data.config.timeout).toBe(30000);
      expect(executeNode!.data.config.memoryLimit).toBe(512);
    });

    it('should have valid condition expression', () => {
      const workflow = workflowTestHelper.loadWorkflow('3-conditional-workflow.json');
      const conditionNode = workflow.nodes.find((n) => n.data.type === 'control.condition');

      expect(conditionNode).toBeDefined();
      expect(conditionNode!.data.config.condition).toBe('input.value > 10');
      expect(conditionNode!.data.config.evaluationType).toBe('expression');
    });

    it('should have valid loop configuration', () => {
      const workflow = workflowTestHelper.loadWorkflow('4-loop-workflow.json');
      const loopNode = workflow.nodes.find((n) => n.data.type === 'control.loop');

      expect(loopNode).toBeDefined();
      expect(loopNode!.data.config.loopType).toBe('forEach');
      expect(loopNode!.data.config.maxIterations).toBe(100);
      expect(loopNode!.data.config.parallel).toBe(false);
    });
  });

  describe('Edge Connectivity', () => {
    it('should have correct edge connections in linear workflows', () => {
      const workflow = workflowTestHelper.loadWorkflow('1-simple-scraping-workflow.json');

      expect(workflow.edges).toHaveLength(2);

      // Verify trigger → scraper
      const edge1 = workflow.edges.find((e) => e.id === 'edge-trigger-scraper');
      expect(edge1).toBeDefined();
      expect(edge1!.source).toBe('trigger-manual-1');
      expect(edge1!.target).toBe('scraper-1');

      // Verify scraper → http
      const edge2 = workflow.edges.find((e) => e.id === 'edge-scraper-http');
      expect(edge2).toBeDefined();
      expect(edge2!.source).toBe('scraper-1');
      expect(edge2!.target).toBe('http-request-1');
    });

    it('should have correct branching edges in conditional workflow', () => {
      const workflow = workflowTestHelper.loadWorkflow('3-conditional-workflow.json');

      // Find condition edges
      const trueEdge = workflow.edges.find((e) => e.sourceHandle === 'true');
      const falseEdge = workflow.edges.find((e) => e.sourceHandle === 'false');

      expect(trueEdge).toBeDefined();
      expect(falseEdge).toBeDefined();
      expect(trueEdge!.source).toBe('condition-1');
      expect(falseEdge!.source).toBe('condition-1');
    });

    it('should have correct loop edges', () => {
      const workflow = workflowTestHelper.loadWorkflow('4-loop-workflow.json');

      // Find loop edges
      const loopEdges = workflow.edges.filter((e) => e.source === 'loop-1');

      expect(loopEdges.length).toBeGreaterThan(0);
      expect(loopEdges.some((e) => e.label === 'FOR EACH')).toBe(true);
    });
  });

  describe('Workflow Metadata', () => {
    it('should have complete metadata for all workflows', () => {
      const workflows = workflowTestHelper.loadAllWorkflows();

      Object.values(workflows).forEach((workflow) => {
        expect(workflow.metadata).toBeDefined();
        expect(workflow.metadata!.name).toBeDefined();
        expect(workflow.metadata!.description).toBeDefined();
        expect(workflow.metadata!.version).toBe('1.0.0');
        expect(workflow.metadata!.tags).toBeDefined();
        expect(workflow.metadata!.tags!.length).toBeGreaterThan(0);
      });
    });

    it('should have unique workflow names', () => {
      const workflows = workflowTestHelper.loadAllWorkflows();
      const names = Object.values(workflows).map((w) => w.metadata!.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe('Workflow Variables', () => {
    it('should define variables in workflows that use them', () => {
      const workflows = workflowTestHelper.loadAllWorkflows();

      Object.values(workflows).forEach((workflow) => {
        if (workflow.variables) {
          expect(typeof workflow.variables).toBe('object');
          expect(Object.keys(workflow.variables).length).toBeGreaterThan(0);
        }
      });
    });
  });
});

/**
 * Example: How to use these workflows in end-to-end tests
 * (This would require the actual workflow execution engine)
 */
describe.skip('Workflow Execution Tests (E2E)', () => {
  // These tests would require actual workflow execution
  // Skipped by default as they need the full execution engine

  it('should execute simple scraping workflow', async () => {
    const workflow = workflowTestHelper.loadWorkflow('1-simple-scraping-workflow.json');
    // const result = await executeWorkflow(workflow);
    // expect(result.status).toBe('completed');
  });

  it('should execute code execution workflow with correct output', async () => {
    const workflow = workflowTestHelper.loadWorkflow('2-code-execution-workflow.json');
    const input = TEST_CASES.codeExecution.input;
    // const result = await executeWorkflow(workflow, input);
    // expect(result.output.mean).toBe(11.5);
  });

  it('should execute conditional workflow for high value', async () => {
    const workflow = workflowTestHelper.loadWorkflow('3-conditional-workflow.json');
    const input = { value: 15 };
    // const result = await executeWorkflow(workflow, input);
    // expect(result.output.result).toBe('HIGH');
  });

  it('should execute conditional workflow for low value', async () => {
    const workflow = workflowTestHelper.loadWorkflow('3-conditional-workflow.json');
    const input = { value: 5 };
    // const result = await executeWorkflow(workflow, input);
    // expect(result.output.result).toBe('LOW');
  });

  it('should execute loop workflow and aggregate results', async () => {
    const workflow = workflowTestHelper.loadWorkflow('4-loop-workflow.json');
    const input = TEST_CASES.loop.input;
    // const result = await executeWorkflow(workflow, input);
    // expect(result.output.summary.totalProcessed).toBe(5);
    // expect(result.output.summary.sumOfSquares).toBe(55);
  });
});
