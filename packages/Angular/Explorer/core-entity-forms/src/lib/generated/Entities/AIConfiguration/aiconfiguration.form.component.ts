import { Component } from '@angular/core';
import { AIConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Configurations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiconfiguration-form',
    templateUrl: './aiconfiguration.form.component.html'
})
export class AIConfigurationFormComponent extends BaseFormComponent {
    public record!: AIConfigurationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'basicInformation', sectionName: 'Basic Information', isExpanded: true },
            { sectionKey: 'configurationSettings', sectionName: 'Configuration Settings', isExpanded: true },
            { sectionKey: 'inheritanceSettings', sectionName: 'Inheritance Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'izzyAIConfigurations', sectionName: 'Izzy AI Configurations', isExpanded: false },
            { sectionKey: 'mJAIAgentConfigurations', sectionName: 'MJ: AI Agent Configurations', isExpanded: false },
            { sectionKey: 'mJAIAgentPrompts', sectionName: 'MJ: AI Agent Prompts', isExpanded: false },
            { sectionKey: 'mJAIConfigurationParams', sectionName: 'MJ: AI Configuration Params', isExpanded: false },
            { sectionKey: 'aIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'mJAIPromptModels', sectionName: 'MJ: AI Prompt Models', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJAIConfigurations', sectionName: 'MJ: AI Configurations', isExpanded: false }
        ]);
    }
}

export function LoadAIConfigurationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
