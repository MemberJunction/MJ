import { Component } from '@angular/core';
import { MJAuthorizationRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Authorization Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjauthorizationrole-form',
    templateUrl: './mjauthorizationrole.form.component.html'
})
export class MJAuthorizationRoleFormComponent extends BaseFormComponent {
    public record!: MJAuthorizationRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceKeys', sectionName: 'Reference Keys', isExpanded: true },
            { sectionKey: 'accessSettings', sectionName: 'Access Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

