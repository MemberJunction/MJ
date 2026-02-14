import { Component } from '@angular/core';
import { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaipromptrun-form',
    templateUrl: './mjaipromptrun.form.component.html'
})
export class MJAIPromptRunFormComponent extends BaseFormComponent {
    public record!: MJAIPromptRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runExecutionCore', sectionName: 'Run Execution Core', isExpanded: true },
            { sectionKey: 'promptResultContent', sectionName: 'Prompt & Result Content', isExpanded: true },
            { sectionKey: 'performanceCostMetrics', sectionName: 'Performance & Cost Metrics', isExpanded: false },
            { sectionKey: 'modelParametersSettings', sectionName: 'Model Parameters & Settings', isExpanded: false },
            { sectionKey: 'validationRetryDetails', sectionName: 'Validation & Retry Details', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIPromptRunMedias', sectionName: 'MJ: AI Prompt Run Medias', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false },
            { sectionKey: 'aIResultCache', sectionName: 'AI Result Cache', isExpanded: false }
        ]);
    }
}

