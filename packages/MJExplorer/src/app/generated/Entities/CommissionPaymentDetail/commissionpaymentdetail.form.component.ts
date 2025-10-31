import { Component } from '@angular/core';
import { CommissionPaymentDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionPaymentDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Payment Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionpaymentdetail-form',
    templateUrl: './commissionpaymentdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionPaymentDetailFormComponent extends BaseFormComponent {
    public record!: CommissionPaymentDetailEntity;
} 

export function LoadCommissionPaymentDetailFormComponent() {
    LoadCommissionPaymentDetailDetailsComponent();
}
