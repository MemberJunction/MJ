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

export function LoadUserRoleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
