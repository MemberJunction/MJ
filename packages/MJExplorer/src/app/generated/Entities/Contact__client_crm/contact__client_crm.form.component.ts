import { Component } from '@angular/core';
import { Contact__client_crmEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContact__client_crmDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Contacts__client_crm') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contact__client_crm-form',
    templateUrl: './contact__client_crm.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Contact__client_crmFormComponent extends BaseFormComponent {
    public record!: Contact__client_crmEntity;
} 

export function LoadContact__client_crmFormComponent() {
    LoadContact__client_crmDetailsComponent();
}
