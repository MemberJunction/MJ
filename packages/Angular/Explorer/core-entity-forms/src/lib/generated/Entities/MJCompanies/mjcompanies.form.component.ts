import { Component } from '@angular/core';
import { MJCompaniesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanies-form',
    templateUrl: './mjcompanies.form.component.html'
})
export class MJCompaniesFormComponent extends BaseFormComponent {
    public record!: MJCompaniesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreCompanyInfo', sectionName: 'Core Company Info', isExpanded: true },
            { sectionKey: 'brandingDigitalPresence', sectionName: 'Branding & Digital Presence', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'companyIntegrations', sectionName: 'Company Integrations', isExpanded: false },
            { sectionKey: 'mJEmployees', sectionName: 'MJ: Employees', isExpanded: false },
            { sectionKey: 'workflows', sectionName: 'Workflows', isExpanded: false },
            { sectionKey: 'mJMCPServerConnections', sectionName: 'MJ: MCP Server Connections', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false }
        ]);
    }
}

