import { Component } from '@angular/core';
import { AuthorizationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Authorizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-authorization-form',
    templateUrl: './authorization.form.component.html'
})
export class AuthorizationFormComponent extends BaseFormComponent {
    public record!: AuthorizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'authorizationHierarchy', sectionName: 'Authorization Hierarchy', isExpanded: true },
            { sectionKey: 'authorizationCore', sectionName: 'Authorization Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'actionAuthorizations', sectionName: 'Action Authorizations', isExpanded: false },
            { sectionKey: 'auditLogTypes', sectionName: 'Audit Log Types', isExpanded: false },
            { sectionKey: 'auditLogs', sectionName: 'Audit Logs', isExpanded: false },
            { sectionKey: 'authorizationRoles', sectionName: 'Authorization Roles', isExpanded: false },
            { sectionKey: 'authorizations', sectionName: 'Authorizations', isExpanded: false }
        ]);
    }
}

export function LoadAuthorizationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
