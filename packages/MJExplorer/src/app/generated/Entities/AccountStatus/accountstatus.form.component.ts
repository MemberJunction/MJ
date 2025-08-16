import { Component } from '@angular/core';
import { AccountStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAccountStatusDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Account Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accountstatus-form',
    templateUrl: './accountstatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AccountStatusFormComponent extends BaseFormComponent {
    public record!: AccountStatusEntity;
} 

export function LoadAccountStatusFormComponent() {
    LoadAccountStatusDetailsComponent();
}
