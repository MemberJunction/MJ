import { Component } from '@angular/core';
import { CompanyIntegrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Company Integrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegration-form',
    templateUrl: './companyintegration.form.component.html'
})
export class CompanyIntegrationFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkingCoreInfo', sectionName: 'Linking & Core Info', isExpanded: true },
            { sectionKey: 'credentialsTokens', sectionName: 'Credentials & Tokens', isExpanded: true },
            { sectionKey: 'externalSystemMapping', sectionName: 'External System Mapping', isExpanded: false },
            { sectionKey: 'runHistoryMonitoring', sectionName: 'Run History & Monitoring', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'companyIntegrationRecordMaps', sectionName: 'Company Integration Record Maps', isExpanded: false },
            { sectionKey: 'companyIntegrationRuns', sectionName: 'Company Integration Runs', isExpanded: false },
            { sectionKey: 'employeeCompanyIntegrations', sectionName: 'Employee Company Integrations', isExpanded: false },
            { sectionKey: 'lists', sectionName: 'Lists', isExpanded: false }
        ]);
    }
}

export function LoadCompanyIntegrationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
