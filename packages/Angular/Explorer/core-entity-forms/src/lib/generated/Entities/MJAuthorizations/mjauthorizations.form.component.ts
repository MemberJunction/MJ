import { Component } from '@angular/core';
import { MJAuthorizationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Authorizations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjauthorizations-form',
    templateUrl: './mjauthorizations.form.component.html'
})
export class MJAuthorizationsFormComponent extends BaseFormComponent {
    public record!: MJAuthorizationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'authorizationHierarchy', sectionName: 'Authorization Hierarchy', isExpanded: true },
            { sectionKey: 'authorizationCore', sectionName: 'Authorization Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'actionAuthorizations', sectionName: 'Action Authorizations', isExpanded: false },
            { sectionKey: 'auditLogTypes', sectionName: 'Audit Log Types', isExpanded: false },
            { sectionKey: 'auditLogs', sectionName: 'Audit Logs', isExpanded: false },
            { sectionKey: 'mJAuthorizationRoles', sectionName: 'MJ: Authorization Roles', isExpanded: false },
            { sectionKey: 'authorizations', sectionName: 'Authorizations', isExpanded: false }
        ]);
    }
}

