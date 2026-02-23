import { Component } from '@angular/core';
import { MJMCPServerConnectionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: MCP Server Connections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmcpserverconnections-form',
    templateUrl: './mjmcpserverconnections.form.component.html'
})
export class MJMCPServerConnectionsFormComponent extends BaseFormComponent {
    public record!: MJMCPServerConnectionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'connectionSettings', sectionName: 'Connection Settings', isExpanded: true },
            { sectionKey: 'automationControls', sectionName: 'Automation Controls', isExpanded: true },
            { sectionKey: 'loggingDiagnostics', sectionName: 'Logging & Diagnostics', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMCPServerConnectionTools', sectionName: 'MJ: MCP Server Connection Tools', isExpanded: false },
            { sectionKey: 'mJMCPToolExecutionLogs', sectionName: 'MJ: MCP Tool Execution Logs', isExpanded: false },
            { sectionKey: 'mJOAuthAuthorizationStates', sectionName: 'MJ: O Auth Authorization States', isExpanded: false },
            { sectionKey: 'mJOAuthClientRegistrations', sectionName: 'MJ: O Auth Client Registrations', isExpanded: false },
            { sectionKey: 'mJOAuthTokens', sectionName: 'MJ: O Auth Tokens', isExpanded: false },
            { sectionKey: 'mJMCPServerConnectionPermissions', sectionName: 'MJ: MCP Server Connection Permissions', isExpanded: false }
        ]);
    }
}

