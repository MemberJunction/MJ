import { Component } from '@angular/core';
import { WorkflowEngineEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Workflow Engines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-workflowengine-form',
    templateUrl: './workflowengine.form.component.html'
})
export class WorkflowEngineFormComponent extends BaseFormComponent {
    public record!: WorkflowEngineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'engineSpecification', sectionName: 'Engine Specification', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'workflows', sectionName: 'Workflows', isExpanded: false }
        ]);
    }
}

