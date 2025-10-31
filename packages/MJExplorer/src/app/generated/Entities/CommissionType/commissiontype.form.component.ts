import { Component } from '@angular/core';
import { CommissionTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissiontype-form',
    templateUrl: './commissiontype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionTypeFormComponent extends BaseFormComponent {
    public record!: CommissionTypeEntity;
} 

export function LoadCommissionTypeFormComponent() {
    LoadCommissionTypeDetailsComponent();
}
