import { Component } from '@angular/core';
import { MJExperimentSessionIterationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Experiment Session Iterations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjexperimentsessioniteration-form',
    templateUrl: './mjexperimentsessioniteration.form.component.html'
})
export class MJExperimentSessionIterationFormComponent extends BaseFormComponent {
    public record!: MJExperimentSessionIterationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionContext', sectionName: 'Session Context', isExpanded: true },
            { sectionKey: 'executionStatus', sectionName: 'Execution Status', isExpanded: true },
            { sectionKey: 'performanceMetrics', sectionName: 'Performance Metrics', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false }
        ]);
    }
}

