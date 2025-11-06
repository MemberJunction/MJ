import { Component } from '@angular/core';
import { DashboardUserPreferenceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard User Preferences') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboarduserpreference-form',
    templateUrl: './dashboarduserpreference.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DashboardUserPreferenceFormComponent extends BaseFormComponent {
    public record!: DashboardUserPreferenceEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadDashboardUserPreferenceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
