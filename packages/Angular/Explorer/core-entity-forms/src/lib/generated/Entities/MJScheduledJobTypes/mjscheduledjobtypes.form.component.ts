import { Component } from '@angular/core';
import { MJScheduledJobTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Job Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscheduledjobtypes-form',
    templateUrl: './mjscheduledjobtypes.form.component.html'
})
export class MJScheduledJobTypesFormComponent extends BaseFormComponent {
    public record!: MJScheduledJobTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'jobTypeDetails', sectionName: 'Job Type Details', isExpanded: true },
            { sectionKey: 'executionIntegration', sectionName: 'Execution Integration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJScheduledJobs', sectionName: 'MJ: Scheduled Jobs', isExpanded: false }
        ]);
    }
}

