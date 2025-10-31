import { Component } from '@angular/core';
import { CommissionPayDetAdjustmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionPayDetAdjustmentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Commission Pay Det Adjustments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionpaydetadjustment-form',
    templateUrl: './commissionpaydetadjustment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionPayDetAdjustmentFormComponent extends BaseFormComponent {
    public record!: CommissionPayDetAdjustmentEntity;
} 

export function LoadCommissionPayDetAdjustmentFormComponent() {
    LoadCommissionPayDetAdjustmentDetailsComponent();
}
