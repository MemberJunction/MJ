import { Component } from '@angular/core';
import { CompanyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Companies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-company-form',
    templateUrl: './company.form.component.html'
})
export class CompanyFormComponent extends BaseFormComponent {
    public record!: CompanyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'coreCompanyInfo', sectionName: 'Core Company Info', isExpanded: true },
            { sectionKey: 'brandingDigitalPresence', sectionName: 'Branding & Digital Presence', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'companyIntegrations', sectionName: 'Company Integrations', isExpanded: false },
            { sectionKey: 'employees', sectionName: 'Employees', isExpanded: false },
            { sectionKey: 'workflows', sectionName: 'Workflows', isExpanded: false },
            { sectionKey: 'mJMCPServerConnections', sectionName: 'MJ: MCP Server Connections', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false }
        ]);
    }
}

