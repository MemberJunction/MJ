import { Component } from '@angular/core';
import { DashboardEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDashboardDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Dashboards') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboard-form',
    templateUrl: './dashboard.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DashboardFormComponent extends BaseFormComponent {
    public record!: DashboardEntity;
} 

export function LoadDashboardFormComponent() {
    LoadDashboardDetailsComponent();
}
