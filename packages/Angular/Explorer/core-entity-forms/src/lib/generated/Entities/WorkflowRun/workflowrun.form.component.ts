import { Component } from '@angular/core';
import { WorkflowRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Workflow Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-workflowrun-form',
    templateUrl: './workflowrun.form.component.html'
})
export class WorkflowRunFormComponent extends BaseFormComponent {
    public record!: WorkflowRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'workflowIdentification', sectionName: 'Workflow Identification', isExpanded: true },
            { sectionKey: 'executionTimelineOutcome', sectionName: 'Execution Timeline & Outcome', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadWorkflowRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
