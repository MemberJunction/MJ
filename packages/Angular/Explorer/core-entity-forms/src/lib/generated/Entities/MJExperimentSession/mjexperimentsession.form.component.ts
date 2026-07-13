import { Component } from '@angular/core';
import { MJExperimentSessionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Experiment Sessions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjexperimentsession-form',
    templateUrl: './mjexperimentsession.form.component.html'
})
export class MJExperimentSessionFormComponent extends BaseFormComponent {
    public record!: MJExperimentSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'sessionDetails', sectionName: 'Session Details', isExpanded: true },
            { sectionKey: 'executionPerformance', sectionName: 'Execution & Performance', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJExperimentSessionIterations', sectionName: 'Experiment Session Iterations', isExpanded: false }
        ]);
    }
}

