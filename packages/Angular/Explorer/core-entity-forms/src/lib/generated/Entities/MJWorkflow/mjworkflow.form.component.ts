import { Component } from '@angular/core';
import { MJWorkflowEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Workflows') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkflow-form',
    templateUrl: './mjworkflow.form.component.html'
})
export class MJWorkflowFormComponent extends BaseFormComponent {
    public record!: MJWorkflowEntity;

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

