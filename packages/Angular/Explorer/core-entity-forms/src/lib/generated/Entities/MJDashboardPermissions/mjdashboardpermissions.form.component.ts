import { Component } from '@angular/core';
import { MJDashboardPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboardpermissions-form',
    templateUrl: './mjdashboardpermissions.form.component.html'
})
export class MJDashboardPermissionsFormComponent extends BaseFormComponent {
    public record!: MJDashboardPermissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentDetails', sectionName: 'Assignment Details', isExpanded: true },
            { sectionKey: 'permissionSettings', sectionName: 'Permission Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

