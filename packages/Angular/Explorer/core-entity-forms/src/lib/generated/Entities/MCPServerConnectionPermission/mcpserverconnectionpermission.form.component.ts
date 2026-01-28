import { Component } from '@angular/core';
import { MCPServerConnectionPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: MCP Server Connection Permissions') // Tell MemberJunction about this class
@Component({
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

export function LoadMCPServerConnectionPermissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
