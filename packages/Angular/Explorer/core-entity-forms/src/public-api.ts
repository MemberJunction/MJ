/*
 * Public API Surface of ng-compare-records
 */

export * from './lib/generated/generated-forms.module';
export * from './lib/custom/custom-forms.module';

// Export test harness components and service
export { 
    AITestHarnessComponent,
    AIAgentRunResult,
    DataContextVariable,
    ConversationMessage as AIAgentConversationMessage,
    SavedConversation
} from './lib/custom/AIAgents/ai-test-harness.component';

export { 
    AITestHarnessDialogComponent,
    AITestHarnessDialogData
} from './lib/custom/AIAgents/ai-test-harness-dialog.component';

// TODO: Prompt test harness components will be added later
// export { 
//     AIPromptTestHarnessComponent,
//     AIPromptRunResult,
//     TemplateVariable,
//     ConversationMessage as AIPromptConversationMessage,
//     SavedPromptConversation
// } from './lib/custom/AIPrompts/ai-prompt-test-harness.component';

// export { 
//     AIPromptTestHarnessDialogComponent,
//     AIPromptTestHarnessDialogData
// } from './lib/custom/AIPrompts/ai-prompt-test-harness-dialog.component';

export { TestHarnessDialogService } from './lib/custom/test-harness-dialog.service';
 