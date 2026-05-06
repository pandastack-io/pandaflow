# Test Workflows - Quick Start Guide

## TL;DR - Get Started in 30 Seconds

```bash
# 1. Navigate to test workflows directory
cd tests/test-workflows

# 2. Import a workflow in your code
import { testWorkflows } from '@/tests/test-workflows';

# 3. Use it!
const workflow = testWorkflows.scraping;
```

## File Overview

| File | Purpose | Use When |
|------|---------|----------|
| `1-simple-scraping-workflow.json` | Web scraping + HTTP | Testing basic integrations |
| `2-code-execution-workflow.json` | Python code execution | Testing Sandflare executor |
| `3-conditional-workflow.json` | Conditional branching | Testing control flow |
| `4-loop-workflow.json` | Array iteration | Testing loops & aggregation |
| `workflow-test-helper.ts` | Testing utilities | Writing automated tests |
| `example-workflow-tests.spec.ts` | Example tests | Learning test patterns |
| `index.ts` | Central exports | Importing workflows |

## Common Use Cases

### 1. Import a Workflow in the UI

```typescript
import { testWorkflows } from '@/tests/test-workflows';
import { useWorkflowStore } from '@/lib/stores/workflow-store';

// Load workflow into the store
const store = useWorkflowStore.getState();
store.loadWorkflow(testWorkflows.scraping);
```

### 2. Validate a Workflow

```typescript
import { workflowTestHelper } from '@/tests/test-workflows';

const workflow = testWorkflows.scraping;
const validation = workflowTestHelper.validateWorkflow(workflow);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

### 3. Get Workflow Statistics

```typescript
import { workflowTestHelper, testWorkflows } from '@/tests/test-workflows';

const stats = workflowTestHelper.getWorkflowStats(testWorkflows.loop);

console.log(`Nodes: ${stats.totalNodes}`);
console.log(`Has loop: ${stats.hasLoop}`);
```

### 4. Write Automated Tests

```typescript
import { describe, it, expect } from 'vitest';
import { testWorkflows, workflowTestHelper } from '@/tests/test-workflows';

describe('Workflow Tests', () => {
  it('should have valid structure', () => {
    const validation = workflowTestHelper.validateWorkflow(testWorkflows.scraping);
    expect(validation.valid).toBe(true);
  });
});
```

### 5. Execute a Workflow (when execution engine is ready)

```typescript
import { executeWorkflow } from '@/lib/execution/workflow-executor';
import { testWorkflows } from '@/tests/test-workflows';

// Execute with input
const result = await executeWorkflow(testWorkflows.codeExecution, {
  data: [1, 2, 3, 4, 5]
});

console.log(result);
```

## Workflow Selection Guide

**Choose the right workflow for your test:**

| If you need to test... | Use this workflow | Key features |
|------------------------|-------------------|--------------|
| Basic HTTP requests | `scraping` | 3 nodes, simple flow |
| Code execution | `codeExecution` | Python, statistics |
| Decision logic | `conditional` | If/else branches |
| Iteration | `loop` | forEach, aggregation |

## Quick Examples

### Example 1: Load and inspect a workflow

```typescript
import { testWorkflows, workflowTestHelper } from '@/tests/test-workflows';

const workflow = testWorkflows.conditional;

// Get basic info
console.log('Name:', workflow.metadata?.name);
console.log('Nodes:', workflow.nodes.length);
console.log('Edges:', workflow.edges.length);

// Get detailed stats
const stats = workflowTestHelper.getWorkflowStats(workflow);
console.log('Stats:', stats);
```

### Example 2: Find nodes of a specific type

```typescript
import { testWorkflows } from '@/tests/test-workflows';

const workflow = testWorkflows.loop;

// Find all Sandflare nodes
const sandflareNodes = workflow.nodes.filter(
  node => node.data.category === 'sandflare'
);

console.log('Sandflare nodes:', sandflareNodes.length);
```

### Example 3: Test workflow metadata

```typescript
import { testWorkflows, workflowMetadata } from '@/tests/test-workflows';

// Get metadata
const meta = workflowMetadata.loop;

console.log(`${meta.name} - Complexity: ${meta.complexity}`);
console.log('Features:', meta.features.join(', '));
```

### Example 4: Validate all workflows at once

```typescript
import { testWorkflows, workflowTestHelper } from '@/tests/test-workflows';

Object.entries(testWorkflows).forEach(([name, workflow]) => {
  const validation = workflowTestHelper.validateWorkflow(workflow);

  if (validation.valid) {
    console.log(`✓ ${name} is valid`);
  } else {
    console.error(`✗ ${name} has errors:`, validation.errors);
  }
});
```

## Input/Output Examples

### Workflow 1: Simple Scraping
```typescript
// Input: (none required)
const result = await execute(testWorkflows.scraping, {});

// Output:
{
  status: 'completed',
  data: {
    title: 'Example Domain',
    content: '...'
  }
}
```

### Workflow 2: Code Execution
```typescript
// Input:
const result = await execute(testWorkflows.codeExecution, {
  data: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30]
});

// Output:
{
  mean: 11.5,
  median: 7.5,
  stdev: 10.38,
  min: 1,
  max: 30,
  ...
}
```

### Workflow 3: Conditional
```typescript
// Input (high value):
const result = await execute(testWorkflows.conditional, {
  value: 15
});

// Output:
{
  result: 'HIGH',
  originalValue: 15,
  multiplier: 30
}

// Input (low value):
const result = await execute(testWorkflows.conditional, {
  value: 5
});

// Output:
{
  result: 'LOW',
  originalValue: 5,
  divider: 2.5
}
```

### Workflow 4: Loop
```typescript
// Input:
const result = await execute(testWorkflows.loop, {
  numbers: [1, 2, 3, 4, 5]
});

// Output:
{
  summary: {
    totalProcessed: 5,
    sumOfSquares: 55,
    sumOfCubes: 225,
    average: 3,
    min: 1,
    max: 5
  }
}
```

## Troubleshooting

### Issue: JSON parse error
**Solution**: Validate JSON syntax
```bash
node -e "JSON.parse(require('fs').readFileSync('1-simple-scraping-workflow.json', 'utf8'))"
```

### Issue: Workflow validation fails
**Solution**: Check validation details
```typescript
const validation = workflowTestHelper.validateWorkflow(workflow);
console.log('Errors:', validation.errors);
console.log('Warnings:', validation.warnings);
```

### Issue: Can't find workflow
**Solution**: Use the index exports
```typescript
// ✗ Don't do this:
import workflow from './1-simple-scraping-workflow.json';

// ✓ Do this instead:
import { testWorkflows } from '@/tests/test-workflows';
const workflow = testWorkflows.scraping;
```

## Next Steps

1. **Read the full documentation**: See `README.md` for detailed info
2. **View workflow diagrams**: See `WORKFLOW-DIAGRAMS.md` for visual flows
3. **Study example tests**: See `example-workflow-tests.spec.ts` for patterns
4. **Write your own tests**: Use `workflow-test-helper.ts` utilities

## Summary Statistics

```typescript
import { workflowSummary } from '@/tests/test-workflows';

console.log(workflowSummary);
// {
//   totalWorkflows: 4,
//   totalNodes: 23,
//   totalEdges: 19,
//   complexityBreakdown: {
//     simple: 2,
//     medium: 1,
//     complex: 1
//   },
//   allFeatures: [
//     'aggregation',
//     'branching',
//     'code-execution',
//     'conditional-logic',
//     ...
//   ]
// }
```

## Tips & Best Practices

1. **Always validate** workflows before execution
2. **Use the test helper** for consistency
3. **Check stats** to understand workflow complexity
4. **Read inline comments** in JSON files for node details
5. **Reference metadata** for workflow capabilities

---

**Need Help?**
- See `README.md` for comprehensive documentation
- See `WORKFLOW-DIAGRAMS.md` for visual flow diagrams
- See `example-workflow-tests.spec.ts` for test examples

**Last Updated**: 2026-05-05
