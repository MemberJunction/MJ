import { Component } from '@angular/core';
import { CommissionPlanDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionPlanDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Commission Plan Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionplandetail-form',
    templateUrl: './commissionplandetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionPlanDetailFormComponent extends BaseFormComponent {
    public record!: CommissionPlanDetailEntity;
} 

export function LoadCommissionPlanDetailFormComponent() {
    LoadCommissionPlanDetailDetailsComponent();
}
