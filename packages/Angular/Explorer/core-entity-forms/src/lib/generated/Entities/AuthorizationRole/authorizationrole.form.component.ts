import { Component } from '@angular/core';
import { AuthorizationRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Authorization Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-authorizationrole-form',
    templateUrl: './authorizationrole.form.component.html'
})
export class AuthorizationRoleFormComponent extends BaseFormComponent {
    public record!: AuthorizationRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceKeys', sectionName: 'Reference Keys', isExpanded: true },
            { sectionKey: 'accessSettings', sectionName: 'Access Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

