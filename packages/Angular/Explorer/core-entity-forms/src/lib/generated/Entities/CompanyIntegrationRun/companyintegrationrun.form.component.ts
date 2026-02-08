import { Component } from '@angular/core';
import { CompanyIntegrationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Company Integration Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-companyintegrationrun-form',
    templateUrl: './companyintegrationrun.form.component.html'
})
export class CompanyIntegrationRunFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runOverview', sectionName: 'Run Overview', isExpanded: true },
            { sectionKey: 'scheduleStatus', sectionName: 'Schedule & Status', isExpanded: true },
            { sectionKey: 'diagnosticDetails', sectionName: 'Diagnostic Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'companyIntegrationRunAPILogs', sectionName: 'Company Integration Run API Logs', isExpanded: false },
            { sectionKey: 'companyIntegrationRunDetails', sectionName: 'Company Integration Run Details', isExpanded: false },
            { sectionKey: 'errorLogs', sectionName: 'Error Logs', isExpanded: false }
        ]);
    }
}

