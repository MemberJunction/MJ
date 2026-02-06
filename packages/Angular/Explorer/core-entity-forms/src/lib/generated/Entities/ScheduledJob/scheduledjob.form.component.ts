import { Component } from '@angular/core';
import { ScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Jobs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-scheduledjob-form',
    templateUrl: './scheduledjob.form.component.html'
})
export class ScheduledJobFormComponent extends BaseFormComponent {
    public record!: ScheduledJobEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'jobDetails', sectionName: 'Job Details', isExpanded: true },
            { sectionKey: 'scheduleTiming', sectionName: 'Schedule & Timing', isExpanded: true },
            { sectionKey: 'executionMetrics', sectionName: 'Execution Metrics', isExpanded: false },
            { sectionKey: 'notificationSettings', sectionName: 'Notification Settings', isExpanded: false },
            { sectionKey: 'distributedLocking', sectionName: 'Distributed Locking', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJScheduledJobRuns', sectionName: 'MJ: Scheduled Job Runs', isExpanded: false }
        ]);
    }
}

export function LoadScheduledJobFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
