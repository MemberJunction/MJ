import { Component } from '@angular/core';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Jobs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscheduledjob-form',
    templateUrl: './mjscheduledjob.form.component.html'
})
export class MJScheduledJobFormComponent extends BaseFormComponent {
    public record!: MJScheduledJobEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'jobDetails', sectionName: 'Job Details', isExpanded: true },
            { sectionKey: 'scheduleTiming', sectionName: 'Schedule & Timing', isExpanded: true },
            { sectionKey: 'executionMetrics', sectionName: 'Execution Metrics', isExpanded: false },
            { sectionKey: 'notificationSettings', sectionName: 'Notification Settings', isExpanded: false },
            { sectionKey: 'distributedLocking', sectionName: 'Distributed Locking', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJScheduledJobRuns', sectionName: 'Scheduled Job Runs', isExpanded: false }
        ]);
    }
}

