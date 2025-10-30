import { Component } from '@angular/core';
import { ContactRelationshipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContactRelationshipDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Contact Relationships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactrelationship-form',
    templateUrl: './contactrelationship.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContactRelationshipFormComponent extends BaseFormComponent {
    public record!: ContactRelationshipEntity;
} 

export function LoadContactRelationshipFormComponent() {
    LoadContactRelationshipDetailsComponent();
}
