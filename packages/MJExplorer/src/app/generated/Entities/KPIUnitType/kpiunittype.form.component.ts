import { Component } from '@angular/core';
import { KPIUnitTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKPIUnitTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'KPI Unit Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-kpiunittype-form',
    templateUrl: './kpiunittype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KPIUnitTypeFormComponent extends BaseFormComponent {
    public record!: KPIUnitTypeEntity;
} 

export function LoadKPIUnitTypeFormComponent() {
    LoadKPIUnitTypeDetailsComponent();
}
