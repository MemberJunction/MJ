import { Component } from '@angular/core';
import { CommissionPlanItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionPlanItemDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Plan Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionplanitem-form',
    templateUrl: './commissionplanitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionPlanItemFormComponent extends BaseFormComponent {
    public record!: CommissionPlanItemEntity;
} 

export function LoadCommissionPlanItemFormComponent() {
    LoadCommissionPlanItemDetailsComponent();
}
