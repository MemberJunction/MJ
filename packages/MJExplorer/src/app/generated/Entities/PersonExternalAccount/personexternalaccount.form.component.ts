import { Component } from '@angular/core';
import { PersonExternalAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonExternalAccountDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Person External Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personexternalaccount-form',
    templateUrl: './personexternalaccount.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonExternalAccountFormComponent extends BaseFormComponent {
    public record!: PersonExternalAccountEntity;
} 

export function LoadPersonExternalAccountFormComponent() {
    LoadPersonExternalAccountDetailsComponent();
}
