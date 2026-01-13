import { Component } from '@angular/core';
import { AIPromptEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'AI Prompts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiprompt-form',
    templateUrl: './aiprompt.form.component.html'
})
export class AIPromptFormComponent extends BaseFormComponent {
    public record!: AIPromptEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promptDefinitionMetadata', sectionName: 'Prompt Definition & Metadata', isExpanded: false },
            { sectionKey: 'modelSelectionExecutionSettings', sectionName: 'Model Selection & Execution Settings', isExpanded: true },
            { sectionKey: 'outputValidation', sectionName: 'Output & Validation', isExpanded: false },
            { sectionKey: 'retryFailoverPolicies', sectionName: 'Retry & Failover Policies', isExpanded: false },
            { sectionKey: 'cachingPerformance', sectionName: 'Caching & Performance', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIAgentActions', sectionName: 'AI Agent Actions', isExpanded: false },
            { sectionKey: 'aIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'mJAIAgentTypes', sectionName: 'MJ: AI Agent Types', isExpanded: false },
            { sectionKey: 'mJAIConfigurations', sectionName: 'MJ: AI Configurations', isExpanded: false },
            { sectionKey: 'aIPrompts', sectionName: 'AI Prompts', isExpanded: false },
            { sectionKey: 'mJAIConfigurations1', sectionName: 'MJ: AI Configurations', isExpanded: false },
            { sectionKey: 'mJAIAgentPrompts', sectionName: 'MJ: AI Agent Prompts', isExpanded: false },
            { sectionKey: 'mJAIAgentSteps', sectionName: 'MJ: AI Agent Steps', isExpanded: false },
            { sectionKey: 'mJAIPromptModels', sectionName: 'MJ: AI Prompt Models', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false },
            { sectionKey: 'aIAgents', sectionName: 'AI Agents', isExpanded: false },
            { sectionKey: 'actions', sectionName: 'Actions', isExpanded: false }
        ]);
    }
}

export function LoadAIPromptFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
