import { Component } from '@angular/core';
import { MJWorkflowRunsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Workflow Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkflowruns-form',
    templateUrl: './mjworkflowruns.form.component.html'
})
export class MJWorkflowRunsFormComponent extends BaseFormComponent {
    public record!: MJWorkflowRunsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'workflowIdentification', sectionName: 'Workflow Identification', isExpanded: true },
            { sectionKey: 'executionTimelineOutcome', sectionName: 'Execution Timeline & Outcome', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

