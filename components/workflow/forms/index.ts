/**
 * Node config form registry — routes each NodeType to its form component.
 */
import { NodeType } from '@/types/nodes';
import { ComponentType } from 'react';

export type { NodeFormProps } from './types';
import { NodeFormProps } from './types';

import { aiForms } from './ai-forms';
import { agentForms } from './agent-forms';
import { memoryForms } from './memory-forms';
import { pandastackforms } from './pandastack-forms';
import { transformForms } from './transform-forms';
import { controlForms } from './control-forms';
import { utilityForms } from './utility-forms';
import { triggerForms } from './trigger-forms';
import { outputForms } from './output-forms';
import { dataForms } from './data-forms';
import { integrationApiForms } from './integration-api-forms';
import { integrationDbForms } from './integration-db-forms';
import { integrationCloudForms } from './integration-cloud-forms';
import { integrationCommForms } from './integration-comm-forms';
import { integrationDevtoolsForms } from './integration-devtools-forms';
import { integrationPaymentForms } from './integration-payment-forms';
import { integrationAnalyticsForms } from './integration-analytics-forms';
import { ragForms } from './rag-forms';

export const nodeFormRegistry: Partial<Record<NodeType, ComponentType<NodeFormProps>>> = {
  ...triggerForms,
  ...pandastackforms,
  ...agentForms,
  ...memoryForms,
  ...aiForms,
  ...ragForms,
  ...transformForms,
  ...controlForms,
  ...integrationApiForms,
  ...integrationDbForms,
  ...integrationCloudForms,
  ...integrationCommForms,
  ...integrationDevtoolsForms,
  ...integrationPaymentForms,
  ...integrationAnalyticsForms,
  ...outputForms,
  ...utilityForms,
  ...dataForms,
};

export function getNodeForm(type: NodeType): ComponentType<NodeFormProps> | undefined {
  return nodeFormRegistry[type];
}
