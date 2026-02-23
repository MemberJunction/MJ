import { Component } from '@angular/core';
import { MJWorkflowEnginesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Workflow Engines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkflowengines-form',
    templateUrl: './mjworkflowengines.form.component.html'
})
export class MJWorkflowEnginesFormComponent extends BaseFormComponent {
    public record!: MJWorkflowEnginesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'engineSpecification', sectionName: 'Engine Specification', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'workflows', sectionName: 'Workflows', isExpanded: false }
        ]);
    }
}

