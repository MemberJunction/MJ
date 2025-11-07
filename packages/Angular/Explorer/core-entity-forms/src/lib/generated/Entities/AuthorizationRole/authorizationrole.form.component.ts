import { Component } from '@angular/core';
import { AuthorizationRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Authorization Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-authorizationrole-form',
    templateUrl: './authorizationrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AuthorizationRoleFormComponent extends BaseFormComponent {
    public record!: AuthorizationRoleEntity;

    // Collapsible section state
    public sectionsExpanded = {
        referenceKeys: true,
        accessSettings: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAuthorizationRoleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
