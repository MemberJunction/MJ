import { Component } from '@angular/core';
import { ScheduledJobRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Job Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledjobrun-form',
    templateUrl: './scheduledjobrun.form.component.html'
})
export class ScheduledJobRunFormComponent extends BaseFormComponent {
    public record!: ScheduledJobRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'jobDetails', sectionName: 'Job Details', isExpanded: true },
            { sectionKey: 'timingQueue', sectionName: 'Timing & Queue', isExpanded: true },
            { sectionKey: 'outcomeStatus', sectionName: 'Outcome & Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false }
        ]);
    }
}

export function LoadScheduledJobRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
