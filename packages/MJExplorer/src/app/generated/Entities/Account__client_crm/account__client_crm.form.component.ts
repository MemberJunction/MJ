import { Component } from '@angular/core';
import { Account__client_crmEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAccount__client_crmDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Accounts__client_crm') // Tell MemberJunction about this class
@Component({
    selector: 'gen-account__client_crm-form',
    templateUrl: './account__client_crm.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Account__client_crmFormComponent extends BaseFormComponent {
    public record!: Account__client_crmEntity;
} 

export function LoadAccount__client_crmFormComponent() {
    LoadAccount__client_crmDetailsComponent();
}
