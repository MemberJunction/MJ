import { Component } from '@angular/core';
import { CESPlanKPIMetricEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCESPlanKPIMetricDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'CES Plan KPI Metrics') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cesplankpimetric-form',
    templateUrl: './cesplankpimetric.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CESPlanKPIMetricFormComponent extends BaseFormComponent {
    public record!: CESPlanKPIMetricEntity;
} 

export function LoadCESPlanKPIMetricFormComponent() {
    LoadCESPlanKPIMetricDetailsComponent();
}
