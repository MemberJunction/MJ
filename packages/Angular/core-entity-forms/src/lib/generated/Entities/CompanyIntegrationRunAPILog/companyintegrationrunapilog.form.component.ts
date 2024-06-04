import { Component } from '@angular/core';
import { CompanyIntegrationRunAPILogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyIntegrationRunAPILogDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Company Integration Run API Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegrationrunapilog-form',
    templateUrl: './companyintegrationrunapilog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationRunAPILogFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunAPILogEntity;
} 

export function LoadCompanyIntegrationRunAPILogFormComponent() {
    LoadCompanyIntegrationRunAPILogDetailsComponent();
}
