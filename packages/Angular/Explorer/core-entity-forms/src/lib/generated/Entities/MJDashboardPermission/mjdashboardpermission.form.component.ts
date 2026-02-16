import { Component } from '@angular/core';
import { MJDashboardPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboardpermission-form',
    templateUrl: './mjdashboardpermission.form.component.html'
})
export class MJDashboardPermissionFormComponent extends BaseFormComponent {
    public record!: MJDashboardPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentDetails', sectionName: 'Assignment Details', isExpanded: true },
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

