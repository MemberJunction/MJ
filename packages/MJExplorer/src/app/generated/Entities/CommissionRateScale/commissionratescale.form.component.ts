import { Component } from '@angular/core';
import { CommissionRateScaleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionRateScaleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Rate Scales') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionratescale-form',
    templateUrl: './commissionratescale.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionRateScaleFormComponent extends BaseFormComponent {
    public record!: CommissionRateScaleEntity;
} 

export function LoadCommissionRateScaleFormComponent() {
    LoadCommissionRateScaleDetailsComponent();
}
