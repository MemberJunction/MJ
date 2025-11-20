import { Component } from '@angular/core';
import { RelationshipTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Relationship Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-relationshiptype-form',
    templateUrl: './relationshiptype.form.component.html'
})
export class RelationshipTypeFormComponent extends BaseFormComponent {
    public record!: RelationshipTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'relationshipTypes', sectionName: 'Relationship Types', isExpanded: false },
            { sectionKey: 'contactRelationships', sectionName: 'Contact Relationships', isExpanded: false }
        ]);
    }
}

export function LoadRelationshipTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
