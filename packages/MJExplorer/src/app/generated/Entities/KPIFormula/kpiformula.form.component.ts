import { Component } from '@angular/core';
import { KPIFormulaEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKPIFormulaDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'KPI Formulas') // Tell MemberJunction about this class
@Component({
    selector: 'gen-kpiformula-form',
    templateUrl: './kpiformula.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KPIFormulaFormComponent extends BaseFormComponent {
    public record!: KPIFormulaEntity;
} 

export function LoadKPIFormulaFormComponent() {
    LoadKPIFormulaDetailsComponent();
}
