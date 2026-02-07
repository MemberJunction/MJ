import { Component } from '@angular/core';
import { WorkflowEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Workflows') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-workflow-form',
    templateUrl: './workflow.form.component.html'
})
export class WorkflowFormComponent extends BaseFormComponent {
    public record!: WorkflowEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreWorkflowDetails', sectionName: 'Core Workflow Details', isExpanded: true },
            { sectionKey: 'schedulingSettings', sectionName: 'Scheduling Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'workflowRuns', sectionName: 'Workflow Runs', isExpanded: false }
        ]);
    }
}

export function LoadWorkflowFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
