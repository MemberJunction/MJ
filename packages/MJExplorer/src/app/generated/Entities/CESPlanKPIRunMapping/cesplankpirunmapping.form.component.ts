import { Component } from '@angular/core';
import { CESPlanKPIRunMappingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCESPlanKPIRunMappingDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'CES Plan KPI Run Mappings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cesplankpirunmapping-form',
    templateUrl: './cesplankpirunmapping.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CESPlanKPIRunMappingFormComponent extends BaseFormComponent {
    public record!: CESPlanKPIRunMappingEntity;
} 

export function LoadCESPlanKPIRunMappingFormComponent() {
    LoadCESPlanKPIRunMappingDetailsComponent();
}
