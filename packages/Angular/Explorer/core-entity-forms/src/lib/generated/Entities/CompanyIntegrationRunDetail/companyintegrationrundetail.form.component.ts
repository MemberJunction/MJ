import { Component } from '@angular/core';
import { CompanyIntegrationRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Company Integration Run Details') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-companyintegrationrundetail-form',
    templateUrl: './companyintegrationrundetail.form.component.html'
})
export class CompanyIntegrationRunDetailFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunDetailEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiersReferences', sectionName: 'Identifiers & References', isExpanded: true },
            { sectionKey: 'operationExecution', sectionName: 'Operation Execution', isExpanded: true },
            { sectionKey: 'runAudit', sectionName: 'Run Audit', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'errorLogs', sectionName: 'Error Logs', isExpanded: false }
        ]);
    }
}

export function LoadCompanyIntegrationRunDetailFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
