import { Component } from '@angular/core';
import { MJApplicationRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Application Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapplicationrole-form',
    templateUrl: './mjapplicationrole.form.component.html'
})
export class MJApplicationRoleFormComponent extends BaseFormComponent {
    public record!: MJApplicationRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'roleAssignment', sectionName: 'Role Assignment', isExpanded: true },
            { sectionKey: 'accessPermissions', sectionName: 'Access Permissions', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

