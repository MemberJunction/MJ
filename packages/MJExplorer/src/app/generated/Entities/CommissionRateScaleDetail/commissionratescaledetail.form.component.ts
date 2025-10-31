import { Component } from '@angular/core';
import { CommissionRateScaleDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionRateScaleDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Commission Rate Scale Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionratescaledetail-form',
    templateUrl: './commissionratescaledetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionRateScaleDetailFormComponent extends BaseFormComponent {
    public record!: CommissionRateScaleDetailEntity;
} 

export function LoadCommissionRateScaleDetailFormComponent() {
    LoadCommissionRateScaleDetailDetailsComponent();
}
