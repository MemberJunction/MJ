import { Component } from '@angular/core';
import { MJEntityPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitypermission-form',
    templateUrl: './mjentitypermission.form.component.html'
})
export class MJEntityPermissionFormComponent extends BaseFormComponent {
    public record!: MJEntityPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityRoleDetails', sectionName: 'Entity & Role Details', isExpanded: true },
            { sectionKey: 'accessRights', sectionName: 'Access Rights', isExpanded: true },
            { sectionKey: 'securityFilters', sectionName: 'Security Filters', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

