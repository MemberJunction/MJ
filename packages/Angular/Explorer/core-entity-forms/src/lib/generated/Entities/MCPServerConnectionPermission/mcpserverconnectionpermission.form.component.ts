import { Component } from '@angular/core';
import { MCPServerConnectionPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: MCP Server Connection Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mcpserverconnectionpermission-form',
    templateUrl: './mcpserverconnectionpermission.form.component.html'
})
export class MCPServerConnectionPermissionFormComponent extends BaseFormComponent {
    public record!: MCPServerConnectionPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'connectionPermissions', sectionName: 'Connection Permissions', isExpanded: true },
            { sectionKey: 'accessAssignment', sectionName: 'Access Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

