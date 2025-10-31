import { Component } from '@angular/core';
import { CommissionPlanEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionPlanDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Plans') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionplan-form',
    templateUrl: './commissionplan.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionPlanFormComponent extends BaseFormComponent {
    public record!: CommissionPlanEntity;
} 

export function LoadCommissionPlanFormComponent() {
    LoadCommissionPlanDetailsComponent();
}
