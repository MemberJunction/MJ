import { Component } from '@angular/core';
import { UserRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-userrole-form',
    templateUrl: './userrole.form.component.html'
})
export class UserRoleFormComponent extends BaseFormComponent {
    public record!: UserRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'roleAssignment', sectionName: 'Role Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

