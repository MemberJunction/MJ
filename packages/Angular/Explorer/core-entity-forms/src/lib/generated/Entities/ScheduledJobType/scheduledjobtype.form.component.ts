import { Component } from '@angular/core';
import { ScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Job Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-scheduledjobtype-form',
    templateUrl: './scheduledjobtype.form.component.html'
})
export class ScheduledJobTypeFormComponent extends BaseFormComponent {
    public record!: ScheduledJobTypeEntity;

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

export function LoadScheduledJobTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
