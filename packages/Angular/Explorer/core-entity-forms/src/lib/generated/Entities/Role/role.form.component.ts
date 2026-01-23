import { Component } from '@angular/core';
import { RoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-role-form',
    templateUrl: './role.form.component.html'
})
export class RoleFormComponent extends BaseFormComponent {
    public record!: RoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreRoleDetails', sectionName: 'Core Role Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'authorizationRoles', sectionName: 'Authorization Roles', isExpanded: false },
            { sectionKey: 'employeeRoles', sectionName: 'Employee Roles', isExpanded: false },
            { sectionKey: 'entityPermissions', sectionName: 'Entity Permissions', isExpanded: false },
            { sectionKey: 'queryPermissions', sectionName: 'Query Permissions', isExpanded: false },
            { sectionKey: 'userRoles', sectionName: 'User Roles', isExpanded: false },
            { sectionKey: 'resourcePermissions', sectionName: 'Resource Permissions', isExpanded: false },
            { sectionKey: 'mJAIAgentPermissions', sectionName: 'MJ: AI Agent Permissions', isExpanded: false }
        ]);
    }
}

export function LoadRoleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
