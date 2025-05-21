import { Component } from '@angular/core';
import { DashboardUserPreferenceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDashboardUserPreferenceDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Dashboard User Preferences') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboarduserpreference-form',
    templateUrl: './dashboarduserpreference.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DashboardUserPreferenceFormComponent extends BaseFormComponent {
    public record!: DashboardUserPreferenceEntity;
} 

export function LoadDashboardUserPreferenceFormComponent() {
    LoadDashboardUserPreferenceDetailsComponent();
}
