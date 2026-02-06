import { Component } from '@angular/core';
import { DashboardCategoryPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Category Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dashboardcategorypermission-form',
    templateUrl: './dashboardcategorypermission.form.component.html'
})
export class DashboardCategoryPermissionFormComponent extends BaseFormComponent {
    public record!: DashboardCategoryPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryIdentification', sectionName: 'Category Identification', isExpanded: true },
            { sectionKey: 'userAccess', sectionName: 'User Access', isExpanded: true },
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadDashboardCategoryPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
