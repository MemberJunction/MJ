import { Component } from '@angular/core';
import { MJDashboardCategoryPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Category Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboardcategorypermission-form',
    templateUrl: './mjdashboardcategorypermission.form.component.html'
})
export class MJDashboardCategoryPermissionFormComponent extends BaseFormComponent {
    public record!: MJDashboardCategoryPermissionEntity;

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

