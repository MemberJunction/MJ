import { Component } from '@angular/core';
import { CommissionAgreementDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionAgreementDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Agreement Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionagreementdetail-form',
    templateUrl: './commissionagreementdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionAgreementDetailFormComponent extends BaseFormComponent {
    public record!: CommissionAgreementDetailEntity;
} 

export function LoadCommissionAgreementDetailFormComponent() {
    LoadCommissionAgreementDetailDetailsComponent();
}
