import { Component } from '@angular/core';
import { CompanyIntegrationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadCompanyIntegrationDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Company Integrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegration-form',
    templateUrl: './companyintegration.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationFormComponent extends BaseFormComponent {
    public record: CompanyIntegrationEntity | null = null;
} 

export function LoadCompanyIntegrationFormComponent() {
    LoadCompanyIntegrationDetailsComponent();
}
