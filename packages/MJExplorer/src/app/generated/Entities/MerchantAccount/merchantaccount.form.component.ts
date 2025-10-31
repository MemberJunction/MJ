import { Component } from '@angular/core';
import { MerchantAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMerchantAccountDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Merchant Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-merchantaccount-form',
    templateUrl: './merchantaccount.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MerchantAccountFormComponent extends BaseFormComponent {
    public record!: MerchantAccountEntity;
} 

export function LoadMerchantAccountFormComponent() {
    LoadMerchantAccountDetailsComponent();
}
