import { Component } from '@angular/core';
import { MJAIPromptEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiprompt-form',
    templateUrl: './mjaiprompt.form.component.html'
})
export class MJAIPromptFormComponent extends BaseFormComponent {
    public record!: MJAIPromptEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promptDefinitionMetadata', sectionName: 'Prompt Definition & Metadata', isExpanded: false },
            { sectionKey: 'modelSelectionExecutionSettings', sectionName: 'Model Selection & Execution Settings', isExpanded: true },
            { sectionKey: 'outputValidation', sectionName: 'Output & Validation', isExpanded: false },
            { sectionKey: 'retryFailoverPolicies', sectionName: 'Retry & Failover Policies', isExpanded: false },
            { sectionKey: 'cachingPerformance', sectionName: 'Caching & Performance', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentActions', sectionName: 'AI Agent Actions', isExpanded: false },
            { sectionKey: 'mJAIAgentTypes', sectionName: 'AI Agent Types', isExpanded: false },
            { sectionKey: 'mJAIConfigurationsDefaultPromptForContextCompressionID', sectionName: 'AI Configurations (Default Prompt For Context Compression)', isExpanded: false },
            { sectionKey: 'mJAIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'mJAIConfigurationsDefaultPromptForContextSummarizationID', sectionName: 'AI Configurations (Default Prompt For Context Summarization)', isExpanded: false },
            { sectionKey: 'mJAIPrompts', sectionName: 'AI Prompts', isExpanded: false },
            { sectionKey: 'mJAIAgentPrompts', sectionName: 'AI Agent Prompts', isExpanded: false },
            { sectionKey: 'mJAIAgentSteps', sectionName: 'AI Agent Steps', isExpanded: false },
            { sectionKey: 'mJAIPromptModels', sectionName: 'AI Prompt Models', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'AI Prompt Runs', isExpanded: false },
            { sectionKey: 'mJAIAgents', sectionName: 'AI Agents', isExpanded: false },
            { sectionKey: 'mJActions', sectionName: 'Actions', isExpanded: false }
        ]);
    }
}

