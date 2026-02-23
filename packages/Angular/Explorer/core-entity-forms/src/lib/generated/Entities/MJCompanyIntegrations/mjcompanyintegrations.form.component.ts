import { Component } from '@angular/core';
import { MJCompanyIntegrationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Company Integrations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcompanyintegrations-form',
    templateUrl: './mjcompanyintegrations.form.component.html'
})
export class MJCompanyIntegrationsFormComponent extends BaseFormComponent {
    public record!: MJCompanyIntegrationsEntity;

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

