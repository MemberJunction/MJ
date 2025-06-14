/*
 * Public API Surface of ng-compare-records
 */

export * from './lib/generated/generated-forms.module';
export * from './lib/custom/custom-forms.module';

// Export test harness components and service
export { 
    AIAgentTestHarnessComponent,
    AIAgentRunResult,
    DataContextVariable,
    ConversationMessage as AIAgentConversationMessage,
    SavedConversation
} from './lib/custom/AIAgents/ai-agent-test-harness.component';

export { 
    AIAgentTestHarnessDialogComponent,
    AIAgentTestHarnessDialogData
} from './lib/custom/AIAgents/ai-agent-test-harness-dialog.component';

export { 
    AIPromptTestHarnessComponent,
    AIPromptRunResult,
    TemplateVariable,
    ConversationMessage as AIPromptConversationMessage,
    SavedPromptConversation
} from './lib/custom/AIPrompts/ai-prompt-test-harness.component';

export { 
    AIPromptTestHarnessDialogComponent,
    AIPromptTestHarnessDialogData
} from './lib/custom/AIPrompts/ai-prompt-test-harness-dialog.component';

export { TestHarnessDialogService } from './lib/custom/test-harness-dialog.service';
 