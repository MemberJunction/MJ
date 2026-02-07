import { Component } from '@angular/core';
import { CompanyIntegrationRunAPILogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Integration Run API Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-companyintegrationrunapilog-form',
    templateUrl: './companyintegrationrunapilog.form.component.html'
})
export class CompanyIntegrationRunAPILogFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunAPILogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'executionTimingStatus', sectionName: 'Execution Timing & Status', isExpanded: true },
            { sectionKey: 'aPICallDetails', sectionName: 'API Call Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadCompanyIntegrationRunAPILogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
