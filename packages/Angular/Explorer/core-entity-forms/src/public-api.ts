/*
 * Public API Surface of ng-compare-records
 */

export * from './lib/generated/generated-forms.module';
export * from './lib/custom/custom-forms.module';


// Export Agent Dialog components and service
export { NewAgentDialogComponent } from './lib/custom/AIAgents/new-agent-dialog.component';
export { NewAgentDialogService } from './lib/custom/AIAgents/new-agent-dialog.service';

// Export Flow Agent components
export { FlowAgentFormSectionComponent } from './lib/custom/AIAgents/FlowAgentType/flow-agent-form-section.component';
// NOTE: Flow editor components have moved to @memberjunction/ng-flow-editor

// NOTE: Action Test Harness components have moved to @memberjunction/ng-actions
 