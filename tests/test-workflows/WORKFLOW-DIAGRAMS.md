# Test Workflow Visual Diagrams

This document provides ASCII diagrams for each test workflow to help visualize the execution flow.

## 1. Simple Scraping Workflow

```
┌─────────────────────┐
│  Manual Trigger     │
│  "Start Scraping"   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Web Scraper        │
│  example.com        │
│  Extract: h1, p     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  HTTP Request       │
│  POST to webhook    │
│  Send scraped data  │
└─────────────────────┘

Nodes: 3
Edges: 2
Purpose: Test web scraping → HTTP integration
```

---

## 2. Code Execution Workflow

```
┌─────────────────────┐
│  Manual Trigger     │
│  Input: data array  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Sandflare Execute  │
│  Language: Python   │
│  Statistical        │
│  Analysis Code      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Log                │
│  Debug output       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Output Response    │
│  Return results     │
└─────────────────────┘

Nodes: 4
Edges: 3
Purpose: Test Python code execution & logging
Expected Output: Statistical metrics (mean, median, stdev, etc.)
```

---

## 3. Conditional Workflow

```
                    ┌─────────────────────┐
                    │  Manual Trigger     │
                    │  Input: value       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Condition          │
                    │  value > 10 ?       │
                    └─────┬──────────┬────┘
                          │          │
                   TRUE   │          │   FALSE
                          │          │
            ┌─────────────┘          └─────────────┐
            │                                      │
            ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────┐
│  Transform Data     │              │  Transform Data     │
│  "HIGH" result      │              │  "LOW" result       │
│  multiplier: x2     │              │  divider: /2        │
└──────────┬──────────┘              └──────────┬──────────┘
           │                                    │
           ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│  Log                │              │  Log                │
│  High value log     │              │  Low value log      │
└──────────┬──────────┘              └──────────┬──────────┘
           │                                    │
           ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│  Output Response    │              │  Output Response    │
│  High value output  │              │  Low value output   │
└─────────────────────┘              └─────────────────────┘

Nodes: 8
Edges: 7
Purpose: Test conditional branching
Paths: 2 (mutually exclusive)
```

---

## 4. Loop Workflow

```
┌─────────────────────┐
│  Manual Trigger     │
│  Input: numbers[]   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Transform          │
│  Prepare Array      │
│  Set defaults       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────────────┐
│  Loop (forEach)                                 │
│  Iterate: [1, 2, 3, 4, 5]                      │
│  maxIterations: 100                             │
└─────┬────────────────────────────────┬──────────┘
      │                                │
      │ FOR EACH ITEM                  │ ALL RESULTS
      │                                │
      ▼                                ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Sandflare Execute  │    │  Aggregate          │
│  Process item:      │    │  Sum, Count, Avg    │
│  - squared          │    │  Min, Max           │
│  - cubed            │    └──────────┬──────────┘
│  - sqrt             │               │
│  - is_even          │               ▼
│  - is_prime         │    ┌─────────────────────┐
│  - factorial        │    │  Transform          │
└──────────┬──────────┘    │  Create Summary     │
           │               └──────────┬──────────┘
           ▼                          │
┌─────────────────────┐               ▼
│  Log                │    ┌─────────────────────┐
│  Each iteration     │    │  Output Response    │
└─────────────────────┘    │  Return summary     │
                           └─────────────────────┘

Nodes: 8
Edges: 7
Purpose: Test array iteration, per-item processing, and aggregation
Loop Iterations: 5 (default array length)
```

---

## Workflow Complexity Matrix

| Workflow | Nodes | Edges | Branches | Loops | Complexity |
|----------|-------|-------|----------|-------|------------|
| 1. Simple Scraping | 3 | 2 | 0 | 0 | ⭐ Simple |
| 2. Code Execution | 4 | 3 | 0 | 0 | ⭐ Simple |
| 3. Conditional | 8 | 7 | 2 | 0 | ⭐⭐ Medium |
| 4. Loop | 8 | 7 | 0 | 1 | ⭐⭐⭐ Complex |

---

## Execution Flow Patterns

### Linear Flow (Workflows 1 & 2)
```
Start → Node A → Node B → Node C → End
```
- Simplest pattern
- Each node executes once in sequence
- No branching or iteration
- Ideal for basic integration testing

### Branching Flow (Workflow 3)
```
         ┌─→ Path A ─┐
Start →  │           → End
         └─→ Path B ─┘
```
- Conditional logic determines path
- Only one path executes per run
- Tests decision-making capabilities
- Requires condition evaluation

### Iterative Flow (Workflow 4)
```
Start → Prepare → Loop ──┬→ Process → Next Item
                    ↑    │
                    └────┘
                         ↓
                    Aggregate → End
```
- Processes each item in collection
- Can run in parallel or sequential
- Aggregates results after completion
- Tests batch processing capabilities

---

## Node Type Usage

### Across All Test Workflows

| Node Type | Count | Workflows Used In |
|-----------|-------|-------------------|
| Manual Trigger | 4 | All workflows |
| Sandflare Execute | 2 | 2, 4 |
| Sandflare Scrape | 1 | 1 |
| HTTP Request | 1 | 1 |
| Condition | 1 | 3 |
| Loop | 1 | 4 |
| Transform Data | 5 | 3, 4 |
| Aggregate | 1 | 4 |
| Log | 5 | 2, 3, 4 |
| Output Response | 5 | 2, 3, 4 |

### Coverage by Category

| Category | Node Types Used | Test Coverage |
|----------|----------------|---------------|
| Trigger | Manual | 100% |
| Sandflare | Execute, Scrape | 100% |
| AI | None | 0% |
| Transform | Data, Aggregate | 66% |
| Control | Condition, Loop | 50% |
| Integration | HTTP | 33% |
| Output | Response | 33% |
| Utility | Log | 33% |

**Coverage Analysis**:
- ✅ Well covered: Triggers, Sandflare, Transform, Control
- ⚠️ Partially covered: Integration, Output, Utility
- ❌ Not covered: AI nodes, Database, Email, Webhooks

---

## Data Flow Examples

### Workflow 1 - Scraping Data Flow
```
Input: (none)
  ↓
Trigger Output: { triggered_at: "2026-05-05T..." }
  ↓
Scraper Output: {
  data: {
    title: "Example Domain",
    content: "This domain is for use in illustrative examples..."
  }
}
  ↓
HTTP Response: {
  status: 200,
  sent: true
}
```

### Workflow 2 - Analysis Data Flow
```
Input: { data: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30] }
  ↓
Python Analysis: {
  mean: 11.5,
  median: 7.5,
  stdev: 10.38,
  ...
}
  ↓
Log Output: [Analysis results logged]
  ↓
Final Output: { ...statistical metrics... }
```

### Workflow 3 - Conditional Data Flow
```
Input: { value: 15 }
  ↓
Condition: 15 > 10 = TRUE
  ↓
Transform: {
  result: "HIGH",
  originalValue: 15,
  multiplier: 30
}
  ↓
Output: { ...high value result... }
```

### Workflow 4 - Loop Data Flow
```
Input: { numbers: [1, 2, 3, 4, 5] }
  ↓
Prepare: { numbers: [1,2,3,4,5], totalItems: 5 }
  ↓
Loop Iteration 1: item=1
  → Process: { squared: 1, cubed: 1, is_prime: false }
Loop Iteration 2: item=2
  → Process: { squared: 4, cubed: 8, is_prime: true }
...
  ↓
Aggregate: {
  sumOfSquares: 55,
  sumOfCubes: 225,
  average: 3
}
  ↓
Final Output: { summary: {...}, metadata: {...} }
```

---

## Testing Scenarios Summary

### Functional Testing
- ✅ Node execution (all node types used)
- ✅ Edge connectivity (all edge types)
- ✅ Data passing between nodes
- ✅ Variable interpolation
- ✅ Error handling (implicit)

### Integration Testing
- ✅ External HTTP requests (Workflow 1)
- ✅ Code execution in microVM (Workflows 2, 4)
- ✅ Web scraping (Workflow 1)
- ⚠️ Database operations (not covered)
- ⚠️ AI/LLM integration (not covered)

### Control Flow Testing
- ✅ Sequential execution (Workflows 1, 2)
- ✅ Conditional branching (Workflow 3)
- ✅ Loop iteration (Workflow 4)
- ⚠️ Parallel execution (not covered)
- ⚠️ Error handling paths (not covered)

---

**Legend**:
- ✅ Fully covered
- ⚠️ Partially covered or not implemented
- ❌ Not covered

---

**Document Version**: 1.0.0
**Last Updated**: 2026-05-05
