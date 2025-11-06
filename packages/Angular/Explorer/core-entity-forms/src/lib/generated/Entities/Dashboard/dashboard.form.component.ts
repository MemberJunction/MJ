import { Component } from '@angular/core';
import { DashboardEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Dashboards') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboard-form',
    templateUrl: './dashboard.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DashboardFormComponent extends BaseFormComponent {
    public record!: DashboardEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJDashboardUserStates: false,
        mJDashboardUserPreferences: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadDashboardFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
