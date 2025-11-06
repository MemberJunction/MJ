import { Component } from '@angular/core';
import { CompanyIntegrationRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Company Integration Run Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegrationrundetail-form',
    templateUrl: './companyintegrationrundetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationRunDetailFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunDetailEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        errorLogs: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadCompanyIntegrationRunDetailFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
