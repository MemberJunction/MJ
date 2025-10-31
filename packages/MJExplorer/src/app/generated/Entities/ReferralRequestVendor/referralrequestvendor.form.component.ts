import { Component } from '@angular/core';
import { ReferralRequestVendorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReferralRequestVendorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Referral Request Vendors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-referralrequestvendor-form',
    templateUrl: './referralrequestvendor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReferralRequestVendorFormComponent extends BaseFormComponent {
    public record!: ReferralRequestVendorEntity;
} 

export function LoadReferralRequestVendorFormComponent() {
    LoadReferralRequestVendorDetailsComponent();
}
