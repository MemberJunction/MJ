import { Component } from '@angular/core';
import { CompanyPhoneEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyPhoneDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Phones') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyphone-form',
    templateUrl: './companyphone.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyPhoneFormComponent extends BaseFormComponent {
    public record!: CompanyPhoneEntity;
} 

export function LoadCompanyPhoneFormComponent() {
    LoadCompanyPhoneDetailsComponent();
}
