import { Component } from '@angular/core';
import { CompanyProductCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyProductCodeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Product Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyproductcode-form',
    templateUrl: './companyproductcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyProductCodeFormComponent extends BaseFormComponent {
    public record!: CompanyProductCodeEntity;
} 

export function LoadCompanyProductCodeFormComponent() {
    LoadCompanyProductCodeDetailsComponent();
}
