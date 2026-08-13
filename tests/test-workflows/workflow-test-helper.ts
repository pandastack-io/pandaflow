/**
 * Test Workflow Helper Utilities
 *
 * This module provides utilities for loading, validating, and testing
 * the workflow JSON definitions in this directory.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { WorkflowDefinition, WorkflowNode } from '@/types/nodes';
import { Edge } from 'reactflow';

export interface WorkflowTestCase {
  name: string;
  description: string;
  filePath: string;
  input?: Record<string, any>;
  expectedOutput?: Record<string, any>;
  validationRules?: ValidationRule[];
}

export interface ValidationRule {
  type: 'node_count' | 'edge_count' | 'has_trigger' | 'has_output' | 'custom';
  message: string;
  validate: (workflow: WorkflowDefinition) => boolean;
}

export class WorkflowTestHelper {
  private workflowsDir: string;

  constructor(workflowsDir?: string) {
    this.workflowsDir = workflowsDir || __dirname;
  }

  /**
   * Load a workflow definition from a JSON file
   */
  loadWorkflow(fileName: string): WorkflowDefinition {
    const filePath = join(this.workflowsDir, fileName);
    const fileContent = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent) as WorkflowDefinition;
  }

  /**
   * Load all test workflows
   */
  loadAllWorkflows(): Record<string, WorkflowDefinition> {
    return {
      scraping: this.loadWorkflow('1-simple-scraping-workflow.json'),
      codeExecution: this.loadWorkflow('2-code-execution-workflow.json'),
      conditional: this.loadWorkflow('3-conditional-workflow.json'),
      loop: this.loadWorkflow('4-loop-workflow.json'),
    };
  }

  /**
   * Validate workflow structure
   */
  validateWorkflow(workflow: WorkflowDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check metadata
    if (!workflow.metadata) {
      warnings.push('Workflow is missing metadata');
    } else {
      if (!workflow.metadata.name) {
        errors.push('Workflow metadata is missing name');
      }
      if (!workflow.metadata.version) {
        warnings.push('Workflow metadata is missing version');
      }
    }

    // Check nodes
    if (!workflow.nodes || workflow.nodes.length === 0) {
      errors.push('Workflow has no nodes');
    } else {
      // Validate node IDs are unique
      const nodeIds = new Set<string>();
      workflow.nodes.forEach((node: WorkflowNode, index: number) => {
        if (!node.id) {
          errors.push(`Node at index ${index} is missing id`);
        } else if (nodeIds.has(node.id)) {
          errors.push(`Duplicate node ID: ${node.id}`);
        } else {
          nodeIds.add(node.id);
        }

        if (!node.type) {
          errors.push(`Node ${node.id} is missing type`);
        }

        if (!node.data) {
          errors.push(`Node ${node.id} is missing data`);
        } else {
          if (!node.data.type) {
            errors.push(`Node ${node.id} data is missing type`);
          }
          if (!node.data.category) {
            errors.push(`Node ${node.id} data is missing category`);
          }
          if (!node.data.config) {
            warnings.push(`Node ${node.id} data is missing config`);
          }
        }

        if (!node.position) {
          warnings.push(`Node ${node.id} is missing position`);
        }
      });

      // Check for at least one trigger node
      const hasTrigger = workflow.nodes.some(
        (node: WorkflowNode) => node.data.category === 'trigger'
      );
      if (!hasTrigger) {
        warnings.push('Workflow has no trigger node');
      }

      // Check for at least one output node
      const hasOutput = workflow.nodes.some(
        (node: WorkflowNode) => node.data.category === 'output'
      );
      if (!hasOutput) {
        warnings.push('Workflow has no output node');
      }
    }

    // Check edges
    if (!workflow.edges || workflow.edges.length === 0) {
      warnings.push('Workflow has no edges');
    } else {
      const nodeIds = new Set(workflow.nodes.map((n: WorkflowNode) => n.id));

      workflow.edges.forEach((edge: Edge, index: number) => {
        if (!edge.id) {
          errors.push(`Edge at index ${index} is missing id`);
        }
        if (!edge.source) {
          errors.push(`Edge ${edge.id || index} is missing source`);
        } else if (!nodeIds.has(edge.source)) {
          errors.push(`Edge ${edge.id} references non-existent source node: ${edge.source}`);
        }
        if (!edge.target) {
          errors.push(`Edge ${edge.id || index} is missing target`);
        } else if (!nodeIds.has(edge.target)) {
          errors.push(`Edge ${edge.id} references non-existent target node: ${edge.target}`);
        }
      });

      // Check for orphaned nodes (nodes with no edges)
      const connectedNodes = new Set<string>();
      workflow.edges.forEach((edge: Edge) => {
        connectedNodes.add(edge.source);
        connectedNodes.add(edge.target);
      });

      workflow.nodes.forEach((node: WorkflowNode) => {
        if (!connectedNodes.has(node.id) && node.data.category !== 'trigger') {
          warnings.push(`Node ${node.id} is not connected to any other nodes`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(workflow: WorkflowDefinition): WorkflowStats {
    const nodesByCategory: Record<string, number> = {};
    const nodesByType: Record<string, number> = {};

    workflow.nodes.forEach((node: WorkflowNode) => {
      const category = node.data.category;
      const type = node.data.type;

      nodesByCategory[category] = (nodesByCategory[category] || 0) + 1;
      nodesByType[type] = (nodesByType[type] || 0) + 1;
    });

    return {
      totalNodes: workflow.nodes.length,
      totalEdges: workflow.edges.length,
      nodesByCategory,
      nodesByType,
      hasTrigger: workflow.nodes.some((n: WorkflowNode) => n.data.category === 'trigger'),
      hasOutput: workflow.nodes.some((n: WorkflowNode) => n.data.category === 'output'),
      hasLoop: workflow.nodes.some((n: WorkflowNode) => n.data.type === 'control.loop'),
      hasCondition: workflow.nodes.some((n: WorkflowNode) => n.data.type === 'control.condition'),
    };
  }

  /**
   * Compare two workflows
   */
  compareWorkflows(workflow1: WorkflowDefinition, workflow2: WorkflowDefinition): WorkflowComparison {
    const stats1 = this.getWorkflowStats(workflow1);
    const stats2 = this.getWorkflowStats(workflow2);

    return {
      nodeDifference: stats2.totalNodes - stats1.totalNodes,
      edgeDifference: stats2.totalEdges - stats1.totalEdges,
      structuralDifferences: this.getStructuralDifferences(stats1, stats2),
    };
  }

  /**
   * Create a test case for a workflow
   */
  createTestCase(
    name: string,
    fileName: string,
    options?: Partial<WorkflowTestCase>
  ): WorkflowTestCase {
    return {
      name,
      description: options?.description || '',
      filePath: fileName,
      input: options?.input,
      expectedOutput: options?.expectedOutput,
      validationRules: options?.validationRules || this.getDefaultValidationRules(),
    };
  }

  /**
   * Run validation rules on a workflow
   */
  runValidationRules(
    workflow: WorkflowDefinition,
    rules: ValidationRule[]
  ): ValidationRuleResult[] {
    return rules.map((rule) => ({
      type: rule.type,
      message: rule.message,
      passed: rule.validate(workflow),
    }));
  }

  /**
   * Get default validation rules
   */
  private getDefaultValidationRules(): ValidationRule[] {
    return [
      {
        type: 'has_trigger',
        message: 'Workflow must have at least one trigger node',
        validate: (workflow) =>
          workflow.nodes.some((n: WorkflowNode) => n.data.category === 'trigger'),
      },
      {
        type: 'has_output',
        message: 'Workflow should have at least one output node',
        validate: (workflow) =>
          workflow.nodes.some((n: WorkflowNode) => n.data.category === 'output'),
      },
      {
        type: 'node_count',
        message: 'Workflow must have at least 2 nodes',
        validate: (workflow) => workflow.nodes.length >= 2,
      },
      {
        type: 'edge_count',
        message: 'Workflow must have at least 1 edge',
        validate: (workflow) => workflow.edges.length >= 1,
      },
    ];
  }

  /**
   * Get structural differences between two workflows
   */
  private getStructuralDifferences(
    stats1: WorkflowStats,
    stats2: WorkflowStats
  ): string[] {
    const differences: string[] = [];

    if (stats1.hasTrigger !== stats2.hasTrigger) {
      differences.push('Trigger presence differs');
    }
    if (stats1.hasOutput !== stats2.hasOutput) {
      differences.push('Output presence differs');
    }
    if (stats1.hasLoop !== stats2.hasLoop) {
      differences.push('Loop presence differs');
    }
    if (stats1.hasCondition !== stats2.hasCondition) {
      differences.push('Condition presence differs');
    }

    return differences;
  }
}

// Type definitions
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WorkflowStats {
  totalNodes: number;
  totalEdges: number;
  nodesByCategory: Record<string, number>;
  nodesByType: Record<string, number>;
  hasTrigger: boolean;
  hasOutput: boolean;
  hasLoop: boolean;
  hasCondition: boolean;
}

export interface WorkflowComparison {
  nodeDifference: number;
  edgeDifference: number;
  structuralDifferences: string[];
}

export interface ValidationRuleResult {
  type: string;
  message: string;
  passed: boolean;
}

// Pre-defined test cases
export const TEST_CASES: Record<string, WorkflowTestCase> = {
  scraping: {
    name: 'Simple Scraping Workflow',
    description: 'Tests web scraping and HTTP request functionality',
    filePath: '1-simple-scraping-workflow.json',
    input: {},
    expectedOutput: {
      status: 'completed',
    },
    validationRules: [
      {
        type: 'node_count',
        message: 'Should have exactly 3 nodes',
        validate: (w) => w.nodes.length === 3,
      },
      {
        type: 'custom',
        message: 'Should have a scraper node',
        validate: (w) => w.nodes.some((n: WorkflowNode) => n.data.type === 'pandastack.scrape'),
      },
      {
        type: 'custom',
        message: 'Should have an HTTP request node',
        validate: (w) => w.nodes.some((n: WorkflowNode) => n.data.type === 'integration.http'),
      },
    ],
  },
  codeExecution: {
    name: 'Code Execution Workflow',
    description: 'Tests Python code execution and data analysis',
    filePath: '2-code-execution-workflow.json',
    input: {
      data: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30],
    },
    expectedOutput: {
      mean: 11.5,
      median: 7.5,
    },
    validationRules: [
      {
        type: 'node_count',
        message: 'Should have exactly 4 nodes',
        validate: (w) => w.nodes.length === 4,
      },
      {
        type: 'custom',
        message: 'Should have a PandaStack execute node',
        validate: (w) => w.nodes.some((n: WorkflowNode) => n.data.type === 'pandastack.execute'),
      },
    ],
  },
  conditional: {
    name: 'Conditional Workflow',
    description: 'Tests conditional branching with two paths',
    filePath: '3-conditional-workflow.json',
    input: {
      value: 15,
    },
    expectedOutput: {
      result: 'HIGH',
      multiplier: 30,
    },
    validationRules: [
      {
        type: 'node_count',
        message: 'Should have exactly 8 nodes',
        validate: (w) => w.nodes.length === 8,
      },
      {
        type: 'custom',
        message: 'Should have a condition node',
        validate: (w) => w.nodes.some((n: WorkflowNode) => n.data.type === 'control.condition'),
      },
      {
        type: 'custom',
        message: 'Should have two output nodes',
        validate: (w) =>
          w.nodes.filter((n: WorkflowNode) => n.data.type === 'output.response').length === 2,
      },
    ],
  },
  loop: {
    name: 'Loop Workflow',
    description: 'Tests array iteration and result aggregation',
    filePath: '4-loop-workflow.json',
    input: {
      numbers: [1, 2, 3, 4, 5],
    },
    expectedOutput: {
      summary: {
        totalProcessed: 5,
        sumOfSquares: 55,
      },
    },
    validationRules: [
      {
        type: 'node_count',
        message: 'Should have exactly 8 nodes',
        validate: (w) => w.nodes.length === 8,
      },
      {
        type: 'custom',
        message: 'Should have a loop node',
        validate: (w) => w.nodes.some((n: WorkflowNode) => n.data.type === 'control.loop'),
      },
      {
        type: 'custom',
        message: 'Should have an aggregate node',
        validate: (w) => w.nodes.some((n: WorkflowNode) => n.data.type === 'transform.aggregate'),
      },
    ],
  },
};

// Export singleton instance
export const workflowTestHelper = new WorkflowTestHelper();
