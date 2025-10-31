import { Component } from '@angular/core';
import { CompanyAddressEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyAddressDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Addresses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyaddress-form',
    templateUrl: './companyaddress.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyAddressFormComponent extends BaseFormComponent {
    public record!: CompanyAddressEntity;
} 

export function LoadCompanyAddressFormComponent() {
    LoadCompanyAddressDetailsComponent();
}
