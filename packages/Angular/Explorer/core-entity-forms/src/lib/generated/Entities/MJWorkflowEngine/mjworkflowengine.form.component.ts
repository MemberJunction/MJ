import { Component } from '@angular/core';
import { MJWorkflowEngineEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Workflow Engines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkflowengine-form',
    templateUrl: './mjworkflowengine.form.component.html'
})
export class MJWorkflowEngineFormComponent extends BaseFormComponent {
    public record!: MJWorkflowEngineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'engineSpecification', sectionName: 'Engine Specification', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJWorkflows', sectionName: 'Workflows', isExpanded: false }
        ]);
    }
}

