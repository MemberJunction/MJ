import { Component } from '@angular/core';
import { MJEntityActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Entity Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityaction-form',
    templateUrl: './mjentityaction.form.component.html'
})
export class MJEntityActionFormComponent extends BaseFormComponent {
    public record!: MJEntityActionEntity;

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

