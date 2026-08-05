import { Component } from '@angular/core';
import { MJEntityFieldPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Field Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentityfieldpermission-form',
    templateUrl: './mjentityfieldpermission.form.component.html'
})
export class MJEntityFieldPermissionFormComponent extends BaseFormComponent {
    public record!: MJEntityFieldPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'permissionScope', sectionName: 'Permission Scope', isExpanded: true },
            { sectionKey: 'accessRules', sectionName: 'Access Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

