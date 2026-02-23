import { Component } from '@angular/core';
import { MJDashboardCategoryPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Category Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboardcategorypermissions-form',
    templateUrl: './mjdashboardcategorypermissions.form.component.html'
})
export class MJDashboardCategoryPermissionsFormComponent extends BaseFormComponent {
    public record!: MJDashboardCategoryPermissionsEntity;

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

