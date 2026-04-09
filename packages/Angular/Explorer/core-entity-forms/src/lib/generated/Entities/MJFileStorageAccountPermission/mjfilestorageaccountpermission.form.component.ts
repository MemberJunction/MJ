import { Component } from '@angular/core';
import { MJFileStorageAccountPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: File Storage Account Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfilestorageaccountpermission-form',
    templateUrl: './mjfilestorageaccountpermission.form.component.html'
})
export class MJFileStorageAccountPermissionFormComponent extends BaseFormComponent {
    public record!: MJFileStorageAccountPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'accessRights', sectionName: 'Access Rights', isExpanded: true },
            { sectionKey: 'granteeDetails', sectionName: 'Grantee Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

