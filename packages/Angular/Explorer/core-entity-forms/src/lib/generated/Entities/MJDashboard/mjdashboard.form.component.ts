import { Component } from '@angular/core';
import { MJDashboardEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Dashboards') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboard-form',
    templateUrl: './mjdashboard.form.component.html'
})
export class MJDashboardFormComponent extends BaseFormComponent {
    public record!: MJDashboardEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dashboardIdentityDescription', sectionName: 'Dashboard Identity & Description', isExpanded: true },
            { sectionKey: 'accessScopeSettings', sectionName: 'Access & Scope Settings', isExpanded: true },
            { sectionKey: 'technicalConfiguration', sectionName: 'Technical Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryLinks', sectionName: 'MJ: Dashboard Category Links', isExpanded: false },
            { sectionKey: 'mJDashboardUserStates', sectionName: 'MJ: Dashboard User States', isExpanded: false },
            { sectionKey: 'mJDashboardPermissions', sectionName: 'MJ: Dashboard Permissions', isExpanded: false },
            { sectionKey: 'mJDashboardUserPreferences', sectionName: 'MJ: Dashboard User Preferences', isExpanded: false }
        ]);
    }
}

