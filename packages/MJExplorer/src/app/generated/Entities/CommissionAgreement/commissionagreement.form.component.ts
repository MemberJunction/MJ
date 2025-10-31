import { Component } from '@angular/core';
import { CommissionAgreementEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionAgreementDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Agreements') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionagreement-form',
    templateUrl: './commissionagreement.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionAgreementFormComponent extends BaseFormComponent {
    public record!: CommissionAgreementEntity;
} 

export function LoadCommissionAgreementFormComponent() {
    LoadCommissionAgreementDetailsComponent();
}
