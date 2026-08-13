# Test Workflow Definitions

This directory contains complete workflow JSON definitions for end-to-end testing of the AI Agent Builder platform.

## Overview

These test workflows cover the core functionality of the workflow engine, including:
- Web scraping and HTTP integrations
- Code execution in PandaStack microVMs
- Conditional branching and control flow
- Loop iteration and result aggregation

## Test Workflows

### 1. Simple Scraping Workflow (`1-simple-scraping-workflow.json`)

**Purpose**: Test basic web scraping and HTTP request functionality

**Flow**:
1. **Manual Trigger** - Starts the workflow manually
2. **Web Scraper** - Scrapes https://example.com using PandaStack
   - Extracts title (h1) and content (p) elements
   - No JavaScript rendering required
3. **HTTP Request** - Sends scraped results to webhook.site
   - POST request with JSON payload
   - Includes timestamp and scraped data

**Test Scenarios**:
- [ ] Manual trigger initiates workflow
- [ ] Web scraper successfully fetches and parses HTML
- [ ] Extraction rules correctly identify title and content
- [ ] HTTP request sends data to webhook endpoint
- [ ] Workflow completes without errors

**How to Test**:
```bash
# Replace 'unique-id-here' with your actual webhook.site ID
# Visit https://webhook.site to get a unique URL
# Update the workflow JSON before importing
```

---

### 2. Code Execution Workflow (`2-code-execution-workflow.json`)

**Purpose**: Test PandaStack code execution with Python data analysis

**Flow**:
1. **Manual Trigger** - Accepts input data array
2. **PandaStack Execute** - Runs Python statistical analysis
   - Calculates mean, median, standard deviation
   - Computes quartiles, min, max, range
   - Uses Python's statistics module
3. **Log** - Logs analysis results for debugging
4. **Output Response** - Returns final results

**Test Scenarios**:
- [ ] Manual trigger passes input data to executor
- [ ] Python code executes in PandaStack microVM
- [ ] Statistical calculations are accurate
- [ ] Results are properly formatted as JSON
- [ ] Log node captures execution output
- [ ] Workflow returns complete analysis

**Sample Input**:
```json
{
  "data": [1, 2, 3, 4, 5, 10, 15, 20, 25, 30]
}
```

**Expected Output**:
```json
{
  "count": 10,
  "sum": 115,
  "mean": 11.5,
  "median": 7.5,
  "stdev": 10.38,
  "min": 1,
  "max": 30,
  "range": 29,
  "q1": 3.0,
  "q3": 20.0
}
```

---

### 3. Conditional Workflow (`3-conditional-workflow.json`)

**Purpose**: Test conditional branching with two distinct execution paths

**Flow**:
1. **Manual Trigger** - Accepts numeric input value
2. **Condition Node** - Evaluates if value > 10
3. **TRUE Path** (if value > 10):
   - Transform Data - Creates "HIGH" result with multiplier
   - Log - Logs high value result
   - Output Response - Returns high value output
4. **FALSE Path** (if value <= 10):
   - Transform Data - Creates "LOW" result with divider
   - Log - Logs low value result
   - Output Response - Returns low value output

**Test Scenarios**:
- [ ] Condition correctly evaluates expression
- [ ] TRUE path executes for values > 10
- [ ] FALSE path executes for values <= 10
- [ ] Transform nodes apply correct logic
- [ ] Only one path executes per workflow run
- [ ] Logs show correct branch execution

**Test Cases**:

| Input Value | Expected Path | Expected Result |
|-------------|---------------|-----------------|
| 15          | TRUE          | HIGH (multiplier: 30) |
| 5           | FALSE         | LOW (divider: 2.5) |
| 10          | FALSE         | LOW (divider: 5) |
| 11          | TRUE          | HIGH (multiplier: 22) |
| 0           | FALSE         | LOW (divider: 0) |

---

### 4. Loop Workflow (`4-loop-workflow.json`)

**Purpose**: Test array iteration, code execution per item, and result aggregation

**Flow**:
1. **Manual Trigger** - Accepts array of numbers
2. **Prepare Array** - Sets default array if not provided
3. **Loop Node** - Iterates over each number (forEach)
4. **For Each Iteration**:
   - PandaStack Execute - Processes each item with Python
     - Calculates squared, cubed, sqrt values
     - Determines if even, prime
     - Computes factorial (if applicable)
   - Log - Logs each iteration result
5. **After Loop Completes**:
   - Aggregate - Summarizes all results
     - Sum of squares and cubes
     - Count, average, min, max
   - Transform Summary - Creates final report
   - Output Response - Returns aggregated summary

**Test Scenarios**:
- [ ] Loop executes correct number of iterations
- [ ] Each item is processed individually
- [ ] Python code runs for each iteration
- [ ] Mathematical calculations are accurate
- [ ] Iteration logs show progress
- [ ] Aggregation combines all results correctly
- [ ] Final summary includes all metrics

**Sample Input**:
```json
{
  "numbers": [1, 2, 3, 4, 5]
}
```

**Expected Iteration Results**:
```
Item 1: squared=1, cubed=1, is_even=false, is_prime=false
Item 2: squared=4, cubed=8, is_even=true, is_prime=true
Item 3: squared=9, cubed=27, is_even=false, is_prime=true
Item 4: squared=16, cubed=64, is_even=true, is_prime=false
Item 5: squared=25, cubed=125, is_even=false, is_prime=true
```

**Expected Aggregated Output**:
```json
{
  "summary": {
    "totalProcessed": 5,
    "sumOfSquares": 55,
    "sumOfCubes": 225,
    "average": 3,
    "min": 1,
    "max": 5,
    "range": 4
  },
  "metadata": {
    "workflow": "Loop Workflow Test",
    "completedAt": "2026-05-05T..."
  }
}
```

---

## Usage Instructions

### Importing Workflows

1. **Via Web UI**:
   - Navigate to the Workflows page
   - Click "Import Workflow"
   - Select one of the JSON files
   - Review the imported nodes and edges
   - Save the workflow

2. **Via API**:
   ```bash
   curl -X POST http://localhost:3000/api/workflows/import \
     -H "Content-Type: application/json" \
     -d @1-simple-scraping-workflow.json
   ```

3. **Programmatically**:
   ```typescript
   import { loadWorkflow } from '@/lib/stores/workflow-store';
   import workflow from './tests/test-workflows/1-simple-scraping-workflow.json';

   const { useWorkflowStore } = require('@/lib/stores/workflow-store');
   const store = useWorkflowStore.getState();
   store.loadWorkflow(workflow);
   ```

### Executing Workflows

1. **Manual Execution**:
   - Open the workflow in the editor
   - Click "Run Workflow" button
   - Provide input data if required
   - Monitor execution status

2. **Via API**:
   ```bash
   curl -X POST http://localhost:3000/api/workflows/{workflowId}/execute \
     -H "Content-Type: application/json" \
     -d '{"input": {"value": 15}}'
   ```

### Validation Checklist

For each workflow, verify:
- ✅ All nodes have valid IDs and types
- ✅ Node configurations match schema requirements
- ✅ Edges correctly connect source to target nodes
- ✅ Node positions are reasonable for visualization
- ✅ Workflow metadata is complete
- ✅ Variables are defined and used correctly
- ✅ Input/output mappings are properly configured

### Troubleshooting

**Common Issues**:

1. **Webhook URL Invalid** (Workflow 1):
   - Update `http-request-1.data.config.url` with valid webhook.site URL
   - Get a URL from https://webhook.site

2. **Python Code Errors** (Workflows 2 & 4):
   - Check syntax in `code` field
   - Verify `input_json` variable is used correctly
   - Ensure `output_json` is set before return

3. **Condition Not Evaluating** (Workflow 3):
   - Verify condition expression syntax
   - Check that input value is accessible
   - Ensure evaluationType is set correctly

4. **Loop Not Iterating** (Workflow 4):
   - Confirm array input is valid
   - Check maxIterations limit
   - Verify edge connections to loop node

## Integration Testing

These workflows can be used in automated tests:

```typescript
// Example integration test
import { describe, it, expect } from 'vitest';
import { executeWorkflow } from '@/lib/execution/workflow-executor';
import scraperWorkflow from './1-simple-scraping-workflow.json';

describe('Simple Scraping Workflow', () => {
  it('should scrape website and send to webhook', async () => {
    const result = await executeWorkflow(scraperWorkflow, {});

    expect(result.status).toBe('completed');
    expect(result.nodes['scraper-1'].status).toBe('completed');
    expect(result.nodes['http-request-1'].status).toBe('completed');
  });
});
```

## Contributing

When adding new test workflows:

1. Follow the naming convention: `{number}-{description}-workflow.json`
2. Include comprehensive inline documentation
3. Add test scenarios to this README
4. Ensure all node IDs are unique
5. Validate JSON structure before committing
6. Test the workflow end-to-end before submitting

## Schema Reference

All workflows follow the `WorkflowDefinition` interface:

```typescript
interface WorkflowDefinition {
  nodes: WorkflowNode[];        // Array of workflow nodes
  edges: Edge[];                // Connections between nodes
  variables?: Record<string, any>; // Workflow-level variables
  metadata?: {
    name: string;               // Workflow name
    description?: string;       // Description
    version?: string;          // Version number
    tags?: string[];           // Categorization tags
  };
}
```

See `/types/nodes.ts` for complete type definitions.

---

**Last Updated**: 2026-05-05
**Version**: 1.0.0
**Maintainer**: AI Agent Builder Team
