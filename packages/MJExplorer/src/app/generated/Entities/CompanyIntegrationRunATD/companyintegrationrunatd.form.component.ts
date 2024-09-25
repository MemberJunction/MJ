import { Component } from '@angular/core';
import { CompanyIntegrationRunATDEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyIntegrationRunATDDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Integration Run ATDs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegrationrunatd-form',
    templateUrl: './companyintegrationrunatd.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationRunATDFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunATDEntity;
} 

export function LoadCompanyIntegrationRunATDFormComponent() {
    LoadCompanyIntegrationRunATDDetailsComponent();
}
