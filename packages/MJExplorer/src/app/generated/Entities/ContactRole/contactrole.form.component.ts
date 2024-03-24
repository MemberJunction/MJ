import { Component } from '@angular/core';
import { ContactRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContactRoleDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Contact Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactrole-form',
    templateUrl: './contactrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContactRoleFormComponent extends BaseFormComponent {
    public record!: ContactRoleEntity;
} 

export function LoadContactRoleFormComponent() {
    LoadContactRoleDetailsComponent();
}
