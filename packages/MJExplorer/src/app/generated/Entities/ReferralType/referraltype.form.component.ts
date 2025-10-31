import { Component } from '@angular/core';
import { ReferralTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReferralTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Referral Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-referraltype-form',
    templateUrl: './referraltype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReferralTypeFormComponent extends BaseFormComponent {
    public record!: ReferralTypeEntity;
} 

export function LoadReferralTypeFormComponent() {
    LoadReferralTypeDetailsComponent();
}
