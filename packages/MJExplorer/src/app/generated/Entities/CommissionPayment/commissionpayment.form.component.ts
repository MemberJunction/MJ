import { Component } from '@angular/core';
import { CommissionPaymentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionPaymentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Payments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionpayment-form',
    templateUrl: './commissionpayment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionPaymentFormComponent extends BaseFormComponent {
    public record!: CommissionPaymentEntity;
} 

export function LoadCommissionPaymentFormComponent() {
    LoadCommissionPaymentDetailsComponent();
}
