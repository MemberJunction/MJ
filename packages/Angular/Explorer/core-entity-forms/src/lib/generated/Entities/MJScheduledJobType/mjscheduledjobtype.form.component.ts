import { Component } from '@angular/core';
import { MJScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Job Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscheduledjobtype-form',
    templateUrl: './mjscheduledjobtype.form.component.html'
})
export class MJScheduledJobTypeFormComponent extends BaseFormComponent {
    public record!: MJScheduledJobTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'jobTypeDetails', sectionName: 'Job Type Details', isExpanded: true },
            { sectionKey: 'executionIntegration', sectionName: 'Execution Integration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJScheduledJobs', sectionName: 'Scheduled Jobs', isExpanded: false }
        ]);
    }
}

