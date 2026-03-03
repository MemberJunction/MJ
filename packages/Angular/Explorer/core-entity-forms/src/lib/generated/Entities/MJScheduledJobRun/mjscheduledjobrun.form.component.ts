import { Component } from '@angular/core';
import { MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Job Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjscheduledjobrun-form',
    templateUrl: './mjscheduledjobrun.form.component.html'
})
export class MJScheduledJobRunFormComponent extends BaseFormComponent {
    public record!: MJScheduledJobRunEntity;

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

