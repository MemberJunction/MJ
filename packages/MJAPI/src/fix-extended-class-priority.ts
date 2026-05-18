/**
 * Forces AICorePlus extended entity classes to win the ClassFactory priority
 * race over their base counterparts from core-entities. The prebuilt
 * server-bootstrap manifest imports the extended classes first, so auto-
 * priority gives the base classes (imported later) the higher priority — the
 * base wins, runtime instances lack relationship arrays (Prompts, Actions,
 * Notes), and BaseAIEngine.AdditionalLoading crashes with
 * "Cannot read properties of undefined (reading 'push')". Re-registering
 * here with an explicit high priority promotes the extensions back to the
 * top.
 */
import { MJGlobal } from '@memberjunction/global';
import { BaseEntity } from '@memberjunction/core';
import {
  MJAIPromptCategoryEntityExtended,
  MJAIPromptEntityExtended,
  MJAIAgentEntityExtended,
  MJAIAgentRunEntityExtended,
  MJAIAgentRunStepEntityExtended,
  MJAIModelEntityExtended,
  MJAIPromptRunEntityExtended,
} from '@memberjunction/ai-core-plus';

const HIGH_PRIORITY = 10_000;
const overrides: Array<[unknown, string]> = [
  [MJAIPromptCategoryEntityExtended, 'MJ: AI Prompt Categories'],
  [MJAIPromptEntityExtended,         'MJ: AI Prompts'],
  [MJAIAgentEntityExtended,          'MJ: AI Agents'],
  [MJAIAgentRunEntityExtended,       'MJ: AI Agent Runs'],
  [MJAIAgentRunStepEntityExtended,   'MJ: AI Agent Run Steps'],
  [MJAIModelEntityExtended,          'MJ: AI Models'],
  [MJAIPromptRunEntityExtended,      'MJ: AI Prompt Runs'],
];
for (const [cls, entityName] of overrides) {
  MJGlobal.Instance.ClassFactory.Register(BaseEntity, cls, entityName, HIGH_PRIORITY);
}
