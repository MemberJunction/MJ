import { Component } from '@angular/core';
import { CompanyCompanyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyCompanyDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Companies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companycompany-form',
    templateUrl: './companycompany.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyCompanyFormComponent extends BaseFormComponent {
    public record!: CompanyCompanyEntity;
} 

export function LoadCompanyCompanyFormComponent() {
    LoadCompanyCompanyDetailsComponent();
}
