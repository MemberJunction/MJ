import { Component } from '@angular/core';
import { MJEntityPermissionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Entity Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjentitypermissions-form',
    templateUrl: './mjentitypermissions.form.component.html'
})
export class MJEntityPermissionsFormComponent extends BaseFormComponent {
    public record!: MJEntityPermissionsEntity;

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

