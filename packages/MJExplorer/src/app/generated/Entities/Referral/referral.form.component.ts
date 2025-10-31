import { Component } from '@angular/core';
import { ReferralEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReferralDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Referrals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-referral-form',
    templateUrl: './referral.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReferralFormComponent extends BaseFormComponent {
    public record!: ReferralEntity;
} 

export function LoadReferralFormComponent() {
    LoadReferralDetailsComponent();
}
