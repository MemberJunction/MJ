import { Component } from '@angular/core';
import { MJMLScoringRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Scoring Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlscoringrun-form',
    templateUrl: './mjmlscoringrun.form.component.html'
})
export class MJMLScoringRunFormComponent extends BaseFormComponent {
    public record!: MJMLScoringRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelAndBindingDetails', sectionName: 'Model and Binding Details', isExpanded: true },
            { sectionKey: 'scoringScopeAndExecution', sectionName: 'Scoring Scope and Execution', isExpanded: true },
            { sectionKey: 'executionRequestAndContext', sectionName: 'Execution Request and Context', isExpanded: true },
            { sectionKey: 'runResultsAndStatus', sectionName: 'Run Results and Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJFeatureValues', sectionName: 'Feature Values', isExpanded: false }
        ]);
    }
}

