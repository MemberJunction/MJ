import { Component } from '@angular/core';
import { CommissionBaseFormulaEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionBaseFormulaDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Base Formulas') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionbaseformula-form',
    templateUrl: './commissionbaseformula.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionBaseFormulaFormComponent extends BaseFormComponent {
    public record!: CommissionBaseFormulaEntity;
} 

export function LoadCommissionBaseFormulaFormComponent() {
    LoadCommissionBaseFormulaDetailsComponent();
}
