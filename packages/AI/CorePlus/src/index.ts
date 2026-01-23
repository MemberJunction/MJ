import { LoadAIPromptCategoryEntityExtended } from './AIPromptCategoryExtended';
import { LoadAIPromptEntityExtended } from './AIPromptExtended';

export * from './prompt.types';
export * from './agent-types';
export * from './agent-payload-change-request';
export * from './prompt.system-placeholders';
export * from './agent-spec';
export * from './response-forms';
export * from './ui-commands';
export * from './conversation-utility';
export * from './foreach-operation';
export * from './while-operation';

export * from './AIPromptExtended';
export * from './AIPromptCategoryExtended';
export * from './AIAgentExtended';
export * from './AIModelExtended';
export * from './AIAgentRunExtended';
export * from './AIAgentRunStepExtended';
export * from './AIPromptRunEntityExtended';

export function LoadAICorePlus() {
    LoadAIPromptEntityExtended();
    LoadAIPromptCategoryEntityExtended();
}
LoadAICorePlus();