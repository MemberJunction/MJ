import { Component } from '@angular/core';
import { DashboardCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Dashboard Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboardcategory-form',
    templateUrl: './dashboardcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DashboardCategoryFormComponent extends BaseFormComponent {
    public record!: DashboardCategoryEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        dashboardCategories: false,
        dashboards: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadDashboardCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
