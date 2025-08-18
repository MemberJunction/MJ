import { Component } from '@angular/core';
import { AccountTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAccountTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Account Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accounttype-form',
    templateUrl: './accounttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AccountTypeFormComponent extends BaseFormComponent {
    public record!: AccountTypeEntity;
} 

export function LoadAccountTypeFormComponent() {
    LoadAccountTypeDetailsComponent();
}
