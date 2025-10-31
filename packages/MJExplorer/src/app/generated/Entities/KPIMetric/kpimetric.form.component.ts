import { Component } from '@angular/core';
import { KPIMetricEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKPIMetricDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'KPI Metrics') // Tell MemberJunction about this class
@Component({
    selector: 'gen-kpimetric-form',
    templateUrl: './kpimetric.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KPIMetricFormComponent extends BaseFormComponent {
    public record!: KPIMetricEntity;
} 

export function LoadKPIMetricFormComponent() {
    LoadKPIMetricDetailsComponent();
}
