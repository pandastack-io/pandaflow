/**
 * Node executor registry — maps every NodeType to its handler function.
 * Category modules register their handlers by importing and spreading into this map.
 */
import { NodeType } from '@/types/nodes';
import { NodeExecutorFn } from './types';

import { aiExecutors } from './ai';
import { agentExecutors } from './agents';
import { agentBusExecutors } from './agent-bus';
import { memoryExecutors } from './memory';
import { sandflareExecutors } from './sandflare';
import { transformExecutors } from './transform';
import { controlExecutors } from './control';
import { utilityExecutors } from './utility';
import { triggerExecutors } from './triggers';
import { outputExecutors } from './output';
import { dataExecutors } from './data';
import { integrationApiExecutors } from './integration-api';
import { integrationDbExecutors } from './integration-db';
import { integrationCloudExecutors } from './integration-cloud';
import { integrationCommExecutors } from './integration-comm';
import { integrationDevtoolsExecutors } from './integration-devtools';
import { integrationPaymentExecutors } from './integration-payment';
import { integrationAnalyticsExecutors } from './integration-analytics';
import { integrationPandaStackExecutors } from './integration-pandastack';
import { ragExecutors } from './rag';
import { verdictExecutors } from './verdict';

export const nodeExecutorRegistry: Partial<Record<NodeType, NodeExecutorFn>> = {
  ...triggerExecutors,
  ...sandflareExecutors,
  ...agentExecutors,
  ...agentBusExecutors,
  ...memoryExecutors,
  ...aiExecutors,
  ...ragExecutors,
  ...verdictExecutors,
  ...transformExecutors,
  ...controlExecutors,
  ...integrationApiExecutors,
  ...integrationDbExecutors,
  ...integrationCloudExecutors,
  ...integrationCommExecutors,
  ...integrationDevtoolsExecutors,
  ...integrationPaymentExecutors,
  ...integrationAnalyticsExecutors,
  ...integrationPandaStackExecutors,
  ...outputExecutors,
  ...utilityExecutors,
  ...dataExecutors,
};

export function getNodeExecutor(type: NodeType): NodeExecutorFn | undefined {
  return nodeExecutorRegistry[type];
}

export type { NodeExecutorFn, ExecutorContext, ExecutorDeps } from './types';
