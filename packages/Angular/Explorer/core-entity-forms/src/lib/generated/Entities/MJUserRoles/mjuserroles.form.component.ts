import { Component } from '@angular/core';
import { MJUserRolesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserroles-form',
    templateUrl: './mjuserroles.form.component.html'
})
export class MJUserRolesFormComponent extends BaseFormComponent {
    public record!: MJUserRolesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'roleAssignment', sectionName: 'Role Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

