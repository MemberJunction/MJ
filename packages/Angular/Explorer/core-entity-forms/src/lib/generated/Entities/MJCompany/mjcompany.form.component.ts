import { Component } from '@angular/core';
import { MJCompanyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompany-form',
    templateUrl: './mjcompany.form.component.html'
})
export class MJCompanyFormComponent extends BaseFormComponent {
    public record!: MJCompanyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreCompanyInfo', sectionName: 'Core Company Info', isExpanded: true },
            { sectionKey: 'brandingDigitalPresence', sectionName: 'Branding & Digital Presence', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCompanyIntegrations', sectionName: 'Company Integrations', isExpanded: false },
            { sectionKey: 'mJEmployees', sectionName: 'Employees', isExpanded: false },
            { sectionKey: 'mJWorkflows', sectionName: 'Workflows', isExpanded: false },
            { sectionKey: 'mJMCPServerConnections', sectionName: 'MCP Server Connections', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'AI Agent Examples', isExpanded: false }
        ]);
    }
}

