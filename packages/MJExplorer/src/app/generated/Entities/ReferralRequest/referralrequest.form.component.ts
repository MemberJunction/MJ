import { Component } from '@angular/core';
import { ReferralRequestEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReferralRequestDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Referral Requests') // Tell MemberJunction about this class
@Component({
    selector: 'gen-referralrequest-form',
    templateUrl: './referralrequest.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReferralRequestFormComponent extends BaseFormComponent {
    public record!: ReferralRequestEntity;
} 

export function LoadReferralRequestFormComponent() {
    LoadReferralRequestDetailsComponent();
}
