import { Component } from '@angular/core';
import { DashboardPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dashboardpermission-form',
    templateUrl: './dashboardpermission.form.component.html'
})
export class DashboardPermissionFormComponent extends BaseFormComponent {
    public record!: DashboardPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentDetails', sectionName: 'Assignment Details', isExpanded: true },
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadDashboardPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
