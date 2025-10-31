import { Component } from '@angular/core';
import { PersonRelationshipTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonRelationshipTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Person Relationship Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personrelationshiptype-form',
    templateUrl: './personrelationshiptype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonRelationshipTypeFormComponent extends BaseFormComponent {
    public record!: PersonRelationshipTypeEntity;
} 

export function LoadPersonRelationshipTypeFormComponent() {
    LoadPersonRelationshipTypeDetailsComponent();
}
