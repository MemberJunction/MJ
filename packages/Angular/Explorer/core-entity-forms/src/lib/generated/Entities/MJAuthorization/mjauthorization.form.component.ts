import { Component } from '@angular/core';
import { MJAuthorizationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Authorizations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjauthorization-form',
    templateUrl: './mjauthorization.form.component.html'
})
export class MJAuthorizationFormComponent extends BaseFormComponent {
    public record!: MJAuthorizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'authorizationHierarchy', sectionName: 'Authorization Hierarchy', isExpanded: true },
            { sectionKey: 'authorizationCore', sectionName: 'Authorization Core', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJActionAuthorizations', sectionName: 'Action Authorizations', isExpanded: false },
            { sectionKey: 'mJAuditLogTypes', sectionName: 'Audit Log Types', isExpanded: false },
            { sectionKey: 'mJAuditLogs', sectionName: 'Audit Logs', isExpanded: false },
            { sectionKey: 'mJAuthorizationRoles', sectionName: 'Authorization Roles', isExpanded: false },
            { sectionKey: 'mJAuthorizations', sectionName: 'Authorizations', isExpanded: false }
        ]);
    }
}

