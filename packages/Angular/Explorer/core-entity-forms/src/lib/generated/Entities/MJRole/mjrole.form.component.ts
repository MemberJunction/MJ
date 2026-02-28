import { Component } from '@angular/core';
import { MJRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrole-form',
    templateUrl: './mjrole.form.component.html'
})
export class MJRoleFormComponent extends BaseFormComponent {
    public record!: MJRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreRoleDetails', sectionName: 'Core Role Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAuthorizationRoles', sectionName: 'Authorization Roles', isExpanded: false },
            { sectionKey: 'mJEmployeeRoles', sectionName: 'Employee Roles', isExpanded: false },
            { sectionKey: 'mJEntityPermissions', sectionName: 'Entity Permissions', isExpanded: false },
            { sectionKey: 'mJQueryPermissions', sectionName: 'Query Permissions', isExpanded: false },
            { sectionKey: 'mJUserRoles', sectionName: 'User Roles', isExpanded: false },
            { sectionKey: 'mJMCPServerConnectionPermissions', sectionName: 'MCP Server Connection Permissions', isExpanded: false },
            { sectionKey: 'mJResourcePermissions', sectionName: 'Resource Permissions', isExpanded: false },
            { sectionKey: 'mJAIAgentPermissions', sectionName: 'AI Agent Permissions', isExpanded: false }
        ]);
    }
}

