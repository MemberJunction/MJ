import { Component } from '@angular/core';
import { ContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContactDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Contacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contact-form',
    templateUrl: './contact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContactFormComponent extends BaseFormComponent {
    public record!: ContactEntity;
} 

export function LoadContactFormComponent() {
    LoadContactDetailsComponent();
}
