import { Component } from '@angular/core';
import { PersonRelationshipAttributeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonRelationshipAttributeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Relationship Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personrelationshipattribute-form',
    templateUrl: './personrelationshipattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonRelationshipAttributeFormComponent extends BaseFormComponent {
    public record!: PersonRelationshipAttributeEntity;
} 

export function LoadPersonRelationshipAttributeFormComponent() {
    LoadPersonRelationshipAttributeDetailsComponent();
}
