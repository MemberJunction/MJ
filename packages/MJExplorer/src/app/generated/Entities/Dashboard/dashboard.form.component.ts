import { Component } from '@angular/core';
import { DashboardEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadDashboardDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Dashboards') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboard-form',
    templateUrl: './dashboard.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DashboardFormComponent extends BaseFormComponent {
    public record: DashboardEntity | null = null;
} 

export function LoadDashboardFormComponent() {
    LoadDashboardDetailsComponent();
}
