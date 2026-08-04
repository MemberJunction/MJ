import { Component } from '@angular/core';
import { MJMCPServerEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: MCP Servers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmcpserver-form',
    templateUrl: './mjmcpserver.form.component.html'
})
export class MJMCPServerFormComponent extends BaseFormComponent {
    public record!: MJMCPServerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'serverIdentificationDetails', sectionName: 'Server Identification & Details', isExpanded: true },
            { sectionKey: 'connectionSettings', sectionName: 'Connection Settings', isExpanded: true },
            { sectionKey: 'authenticationCredentials', sectionName: 'Authentication & Credentials', isExpanded: true },
            { sectionKey: 'performanceLimits', sectionName: 'Performance & Limits', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJOAuthClientRegistrations', sectionName: 'O Auth Client Registrations', isExpanded: false },
            { sectionKey: 'mJMCPServerConnections', sectionName: 'MCP Server Connections', isExpanded: false },
            { sectionKey: 'mJMCPServerTools', sectionName: 'MCP Server Tools', isExpanded: false }
        ]);
    }
}

