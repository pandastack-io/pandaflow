/**
 * Test Workflows Index
 *
 * Central export point for all test workflow definitions and utilities.
 * Import from this file to access workflows, test cases, and helper functions.
 *
 * @example
 * ```typescript
 * import { testWorkflows, workflowTestHelper, TEST_CASES } from '@/tests/test-workflows';
 *
 * // Load a specific workflow
 * const workflow = testWorkflows.scraping;
 *
 * // Validate a workflow
 * const validation = workflowTestHelper.validateWorkflow(workflow);
 *
 * // Get workflow stats
 * const stats = workflowTestHelper.getWorkflowStats(workflow);
 * ```
 */

import scrapingWorkflow from './1-simple-scraping-workflow.json';
import codeExecutionWorkflow from './2-code-execution-workflow.json';
import conditionalWorkflow from './3-conditional-workflow.json';
import loopWorkflow from './4-loop-workflow.json';

export {
  workflowTestHelper,
  WorkflowTestHelper,
  TEST_CASES,
  type WorkflowTestCase,
  type ValidationRule,
  type ValidationResult,
  type WorkflowStats,
  type WorkflowComparison,
  type ValidationRuleResult,
} from './workflow-test-helper';

/**
 * All test workflows as JSON objects
 */
export const testWorkflows = {
  scraping: scrapingWorkflow,
  codeExecution: codeExecutionWorkflow,
  conditional: conditionalWorkflow,
  loop: loopWorkflow,
} as const;

/**
 * Test workflow metadata
 */
export const workflowMetadata = {
  scraping: {
    name: 'Simple Scraping Workflow',
    description: 'Test workflow for web scraping and HTTP integration',
    nodeCount: 3,
    edgeCount: 2,
    complexity: 'simple',
    features: ['web-scraping', 'http-request'],
  },
  codeExecution: {
    name: 'Code Execution Workflow',
    description: 'Test workflow for Python code execution and data analysis',
    nodeCount: 4,
    edgeCount: 3,
    complexity: 'simple',
    features: ['code-execution', 'python', 'logging'],
  },
  conditional: {
    name: 'Conditional Workflow',
    description: 'Test workflow for conditional branching',
    nodeCount: 8,
    edgeCount: 7,
    complexity: 'medium',
    features: ['conditional-logic', 'branching', 'multiple-outputs'],
  },
  loop: {
    name: 'Loop Workflow',
    description: 'Test workflow for array iteration and aggregation',
    nodeCount: 8,
    edgeCount: 7,
    complexity: 'complex',
    features: ['loops', 'iteration', 'aggregation', 'code-execution'],
  },
} as const;

/**
 * Get all workflow names
 */
export const getWorkflowNames = () => Object.keys(testWorkflows);

/**
 * Get workflow by name
 */
export const getWorkflowByName = (name: keyof typeof testWorkflows) => {
  return testWorkflows[name];
};

/**
 * Get workflows by complexity level
 */
export const getWorkflowsByComplexity = (complexity: 'simple' | 'medium' | 'complex') => {
  return Object.entries(workflowMetadata)
    .filter(([_, meta]) => meta.complexity === complexity)
    .map(([name, _]) => testWorkflows[name as keyof typeof testWorkflows]);
};

/**
 * Get workflows by feature
 */
export const getWorkflowsByFeature = (feature: string) => {
  return Object.entries(workflowMetadata)
    .filter(([_, meta]) => (meta.features as unknown as string[]).includes(feature))
    .map(([name, _]) => testWorkflows[name as keyof typeof testWorkflows]);
};

/**
 * Summary of all test workflows
 */
export const workflowSummary = {
  totalWorkflows: Object.keys(testWorkflows).length,
  totalNodes: Object.values(workflowMetadata).reduce((sum, meta) => sum + meta.nodeCount, 0),
  totalEdges: Object.values(workflowMetadata).reduce((sum, meta) => sum + meta.edgeCount, 0),
  complexityBreakdown: {
    simple: Object.values(workflowMetadata).filter((m) => m.complexity === 'simple').length,
    medium: Object.values(workflowMetadata).filter((m) => m.complexity === 'medium').length,
    complex: Object.values(workflowMetadata).filter((m) => m.complexity === 'complex').length,
  },
  allFeatures: [
    ...new Set(
      Object.values(workflowMetadata).flatMap((meta) => meta.features)
    ),
  ].sort(),
};

/**
 * Default export - all workflows
 */
export default testWorkflows;
