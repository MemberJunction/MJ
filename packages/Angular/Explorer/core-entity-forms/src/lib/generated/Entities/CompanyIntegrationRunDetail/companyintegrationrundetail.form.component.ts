import { Component } from '@angular/core';
import { CompanyIntegrationRunDetailEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyIntegrationRunDetailDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Company Integration Run Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegrationrundetail-form',
    templateUrl: './companyintegrationrundetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationRunDetailFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRunDetailEntity;
} 

export function LoadCompanyIntegrationRunDetailFormComponent() {
    LoadCompanyIntegrationRunDetailDetailsComponent();
}
