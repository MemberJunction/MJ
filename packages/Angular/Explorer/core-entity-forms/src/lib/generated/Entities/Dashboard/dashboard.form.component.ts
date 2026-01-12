import { Component } from '@angular/core';
import { DashboardEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Dashboards') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboard-form',
    templateUrl: './dashboard.form.component.html'
})
export class DashboardFormComponent extends BaseFormComponent {
    public record!: DashboardEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dashboardIdentityDescription', sectionName: 'Dashboard Identity & Description', isExpanded: true },
            { sectionKey: 'accessScopeSettings', sectionName: 'Access & Scope Settings', isExpanded: true },
            { sectionKey: 'technicalConfiguration', sectionName: 'Technical Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDashboardUserStates', sectionName: 'MJ: Dashboard User States', isExpanded: false },
            { sectionKey: 'mJDashboardUserPreferences', sectionName: 'MJ: Dashboard User Preferences', isExpanded: false }
        ]);
    }
}

export function LoadDashboardFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
