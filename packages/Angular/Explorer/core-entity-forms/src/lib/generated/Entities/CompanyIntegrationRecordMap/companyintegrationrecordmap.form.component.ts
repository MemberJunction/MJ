import { Component } from '@angular/core';
import { CompanyIntegrationRecordMapEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Company Integration Record Maps') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegrationrecordmap-form',
    templateUrl: './companyintegrationrecordmap.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationRecordMapFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRecordMapEntity;

    // Collapsible section state
    public sectionsExpanded = {
        integrationKeys: true,
        mappingDetails: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadCompanyIntegrationRecordMapFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
