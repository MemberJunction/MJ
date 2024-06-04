import { Component } from '@angular/core';
import { CompanyIntegrationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyIntegrationRunDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Company Integration Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegrationrun-form',
    templateUrl: './companyintegrationrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationRunFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunEntity;
} 

export function LoadCompanyIntegrationRunFormComponent() {
    LoadCompanyIntegrationRunDetailsComponent();
}
