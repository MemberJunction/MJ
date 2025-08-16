import { Component } from '@angular/core';
import { RelationshipTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRelationshipTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Relationship Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-relationshiptype-form',
    templateUrl: './relationshiptype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RelationshipTypeFormComponent extends BaseFormComponent {
    public record!: RelationshipTypeEntity;
} 

export function LoadRelationshipTypeFormComponent() {
    LoadRelationshipTypeDetailsComponent();
}
