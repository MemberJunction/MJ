import { Component } from '@angular/core';
import { KPIResultEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadKPIResultDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'KPI Results') // Tell MemberJunction about this class
@Component({
    selector: 'gen-kpiresult-form',
    templateUrl: './kpiresult.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class KPIResultFormComponent extends BaseFormComponent {
    public record!: KPIResultEntity;
} 

export function LoadKPIResultFormComponent() {
    LoadKPIResultDetailsComponent();
}
