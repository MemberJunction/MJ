import { Component } from '@angular/core';
import { MJAIConfigurationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Configurations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiconfiguration-form',
    templateUrl: './mjaiconfiguration.form.component.html'
})
export class MJAIConfigurationFormComponent extends BaseFormComponent {
    public record!: MJAIConfigurationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'basicInformation', sectionName: 'Basic Information', isExpanded: true },
            { sectionKey: 'configurationSettings', sectionName: 'Configuration Settings', isExpanded: true },
            { sectionKey: 'inheritanceSettings', sectionName: 'Inheritance Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentConfigurations', sectionName: 'MJ: AI Agent Configurations', isExpanded: false },
            { sectionKey: 'mJAIAgentPrompts', sectionName: 'MJ: AI Agent Prompts', isExpanded: false },
            { sectionKey: 'mJAIConfigurationParams', sectionName: 'MJ: AI Configuration Params', isExpanded: false },
            { sectionKey: 'mJAIPromptModels', sectionName: 'MJ: AI Prompt Models', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false },
            { sectionKey: 'aIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJAIConfigurations', sectionName: 'MJ: AI Configurations', isExpanded: false }
        ]);
    }
}

