import { Component } from '@angular/core';
import { KPIMetricMappingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKPIMetricMappingDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'KPI Metric Mappings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-kpimetricmapping-form',
    templateUrl: './kpimetricmapping.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KPIMetricMappingFormComponent extends BaseFormComponent {
    public record!: KPIMetricMappingEntity;
} 

export function LoadKPIMetricMappingFormComponent() {
    LoadKPIMetricMappingDetailsComponent();
}
