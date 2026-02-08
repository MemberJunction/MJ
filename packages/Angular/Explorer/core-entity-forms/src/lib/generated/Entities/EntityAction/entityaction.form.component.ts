import { Component } from '@angular/core';
import { EntityActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Entity Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entityaction-form',
    templateUrl: './entityaction.form.component.html'
})
export class EntityActionFormComponent extends BaseFormComponent {
    public record!: EntityActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipKeys', sectionName: 'Relationship Keys', isExpanded: true },
            { sectionKey: 'actionConfiguration', sectionName: 'Action Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entityActionFilters', sectionName: 'Entity Action Filters', isExpanded: false },
            { sectionKey: 'entityActionInvocations', sectionName: 'Entity Action Invocations', isExpanded: false },
            { sectionKey: 'entityActionParams', sectionName: 'Entity Action Params', isExpanded: false }
        ]);
    }
}

