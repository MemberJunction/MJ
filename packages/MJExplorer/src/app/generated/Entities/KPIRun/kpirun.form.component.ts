import { Component } from '@angular/core';
import { KPIRunEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKPIRunDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'KPI Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-kpirun-form',
    templateUrl: './kpirun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KPIRunFormComponent extends BaseFormComponent {
    public record!: KPIRunEntity;
} 

export function LoadKPIRunFormComponent() {
    LoadKPIRunDetailsComponent();
}
