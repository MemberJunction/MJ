import { Component } from '@angular/core';
import { AccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAccountDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-account-form',
    templateUrl: './account.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AccountFormComponent extends BaseFormComponent {
    public record!: AccountEntity;
} 

export function LoadAccountFormComponent() {
    LoadAccountDetailsComponent();
}
