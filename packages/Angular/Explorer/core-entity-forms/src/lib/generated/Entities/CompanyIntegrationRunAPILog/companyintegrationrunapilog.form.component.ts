import { Component } from '@angular/core';
import { CompanyIntegrationRunAPILogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Integration Run API Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegrationrunapilog-form',
    templateUrl: './companyintegrationrunapilog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationRunAPILogFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunAPILogEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadCompanyIntegrationRunAPILogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
