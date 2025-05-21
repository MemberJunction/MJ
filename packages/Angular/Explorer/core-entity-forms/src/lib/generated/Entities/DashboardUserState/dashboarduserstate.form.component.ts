import { Component } from '@angular/core';
import { DashboardUserStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDashboardUserStateDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Dashboard User States') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboarduserstate-form',
    templateUrl: './dashboarduserstate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DashboardUserStateFormComponent extends BaseFormComponent {
    public record!: DashboardUserStateEntity;
} 

export function LoadDashboardUserStateFormComponent() {
    LoadDashboardUserStateDetailsComponent();
}
