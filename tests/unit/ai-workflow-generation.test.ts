import { describe, expect, it } from 'vitest';
import { buildFallbackWorkflow, normalizeGeneratedWorkflow } from '@/lib/workflows/ai-generation';
import { NodeType } from '@/types/nodes';

describe('AI workflow generation', () => {
  it('builds a realistic fallback workflow for Slack digests', () => {
    const workflow = buildFallbackWorkflow('Summarize emails and send Slack digest');

    expect(workflow.nodeCount).toBeGreaterThanOrEqual(5);
    expect(workflow.nodeCount).toBeLessThanOrEqual(6);
    expect(workflow.nodes.some((node) => node.nodeType === NodeType.AI_SUMMARIZATION)).toBe(true);
    expect(workflow.nodes.some((node) => node.nodeType === NodeType.INTEGRATION_SLACK)).toBe(true);
    expect(workflow.definition.edges).toHaveLength(workflow.nodeCount - 1);
  });

  it('includes a Python node when the description asks for Python analysis', () => {
    const workflow = buildFallbackWorkflow('Run Python data analysis on CSV files');

    expect(workflow.nodes.some((node) => node.nodeType === NodeType.SANDFLARE_PYTHON)).toBe(true);
    expect(workflow.nodes.at(-1)?.nodeType).toBe(NodeType.OUTPUT_EMAIL);
  });

  it('maps AI aliases into supported app node types', () => {
    const workflow = normalizeGeneratedWorkflow({
      name: 'Alias Workflow',
      description: 'Generated from aliases',
      nodes: [
        {
          id: 'node-1',
          type: 'trigger.schedule',
          data: { label: 'Schedule', nodeType: 'trigger.schedule', config: { cron: '0 9 * * *', timezone: 'UTC' } },
        },
        {
          id: 'node-2',
          type: 'ai.agent',
          data: { label: 'Research Agent', nodeType: 'ai.agent', config: { goal: 'Research the incoming topic', model: 'gpt-4o' } },
        },
        {
          id: 'node-3',
          type: 'output.slack',
          data: { label: 'Post to Slack', nodeType: 'output.slack', config: { channel: '#ops', message: '{{input}}' } },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'node-1', target: 'node-2', sourceHandle: 'output-0', targetHandle: 'input-0' },
        { id: 'edge-2', source: 'node-2', target: 'node-3', sourceHandle: 'output-0', targetHandle: 'input-0' },
      ],
    }, 'Schedule research and post updates to Slack');

    expect(workflow.definition.nodes[0]?.data.type).toBe(NodeType.TRIGGER_SCHEDULE);
    expect(workflow.definition.nodes[1]?.data.type).toBe(NodeType.AGENT_LLM);
    expect(workflow.definition.nodes[2]?.data.type).toBe(NodeType.INTEGRATION_SLACK);
    expect(workflow.definition.edges[0]?.sourceHandle).toBe('output');
  });
});
