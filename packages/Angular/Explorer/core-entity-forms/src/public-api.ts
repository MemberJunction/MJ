/*
 * Public API Surface of ng-core-entity-forms
 */

export * from './lib/generated/generated-forms.module';
export * from './lib/custom/custom-forms.module';

// Custom entity form components (must be individually exported for manifest builder)
export { MJEntityFormComponentExtended } from './lib/custom/Entities/entity-form.component';
export { MJEntityActionFormComponentExtended } from './lib/custom/EntityActions/entityaction.form.component';
export { MJTemplateFormComponentExtended } from './lib/custom/Templates/templates-form.component';
export { MJAIPromptFormComponentExtended } from './lib/custom/AIPrompts/ai-prompt-form.component';
export { MJAIAgentFormComponentExtended } from './lib/custom/AIAgents/ai-agent-form.component';
export { MJAIPromptRunFormComponentExtended } from './lib/custom/AIPromptRuns/ai-prompt-run-form.component';
export { MJActionFormComponentExtended } from './lib/custom/Actions/action-form.component';
export { MJActionExecutionLogFormComponentExtended } from './lib/custom/Actions/action-execution-log-form.component';
export { MJAIAgentRunFormComponentExtended } from './lib/custom/ai-agent-run/ai-agent-run.component';
export { MJQueryFormComponentExtended } from './lib/custom/Queries/query-form.component';
export { MJTestRunFormComponentExtended } from './lib/custom/Tests/test-run-form.component';
export { MJTestFormComponentExtended } from './lib/custom/Tests/test-form.component';
export { MJTestSuiteRunFormComponentExtended } from './lib/custom/Tests/test-suite-run-form.component';
export { MJTestSuiteFormComponentExtended } from './lib/custom/Tests/test-suite-form.component';
export { MJTestRunFeedbackFormComponentExtended } from './lib/custom/Tests/test-run-feedback-form.component';
export { MJTestRubricFormComponentExtended } from './lib/custom/Tests/test-rubric-form.component';
export { MJListFormComponentExtended } from './lib/custom/Lists/list-form.component';
export { MJAIAgentSessionFormComponentExtended } from './lib/custom/AIAgentSessions/ai-agent-session-form.component';
export { MJAIAgentChannelFormComponentExtended } from './lib/custom/AIAgentChannels/ai-agent-channel-form.component';

// Custom form supporting components
export { TemplateEditorComponent } from './lib/shared/components/template-editor.component';
export { ChatMessageViewerComponent } from './lib/custom/AIPromptRuns/chat-message-viewer.component';
export { AIAgentRunTimelineComponent } from './lib/custom/ai-agent-run/ai-agent-run-timeline.component';
export { AIAgentRunStepNodeComponent } from './lib/custom/ai-agent-run/ai-agent-run-step-node.component';
export { AIAgentRunAnalyticsComponent } from './lib/custom/ai-agent-run/ai-agent-run-analytics.component';
export { EntityLinkPillComponent } from './lib/custom/Tests/entity-link-pill.component';

// Agent Dialog components and service
export { NewAgentDialogComponent } from './lib/custom/AIAgents/new-agent-dialog.component';
export { NewAgentDialogService } from './lib/custom/AIAgents/new-agent-dialog.service';

// Flow Agent components
export { FlowAgentFormSectionComponent } from './lib/custom/AIAgents/FlowAgentType/flow-agent-form-section.component';
// NOTE: Flow editor components have moved to @memberjunction/ng-flow-editor

// NOTE: Action Test Harness components have moved to @memberjunction/ng-actions
 