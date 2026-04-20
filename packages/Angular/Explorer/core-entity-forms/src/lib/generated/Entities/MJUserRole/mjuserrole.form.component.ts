import { Component } from '@angular/core';
import { MJUserRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserrole-form',
    templateUrl: './mjuserrole.form.component.html'
})
export class MJUserRoleFormComponent extends BaseFormComponent {
    public record!: MJUserRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'roleAssignment', sectionName: 'Role Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

