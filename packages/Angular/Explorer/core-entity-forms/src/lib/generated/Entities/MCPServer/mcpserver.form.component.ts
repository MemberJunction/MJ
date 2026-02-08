import { Component } from '@angular/core';
import { MCPServerEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: MCP Servers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mcpserver-form',
    templateUrl: './mcpserver.form.component.html'
})
export class MCPServerFormComponent extends BaseFormComponent {
    public record!: MCPServerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'serverIdentificationDetails', sectionName: 'Server Identification & Details', isExpanded: true },
            { sectionKey: 'connectionSettings', sectionName: 'Connection Settings', isExpanded: true },
            { sectionKey: 'authenticationCredentials', sectionName: 'Authentication & Credentials', isExpanded: false },
            { sectionKey: 'performanceLimits', sectionName: 'Performance & Limits', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJOAuthClientRegistrations', sectionName: 'MJ: O Auth Client Registrations', isExpanded: false },
            { sectionKey: 'mJMCPServerConnections', sectionName: 'MJ: MCP Server Connections', isExpanded: false },
            { sectionKey: 'mJMCPServerTools', sectionName: 'MJ: MCP Server Tools', isExpanded: false }
        ]);
    }
}

