import { Component } from '@angular/core';
import { CompanyTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Company Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companytype-form',
    templateUrl: './companytype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyTypeFormComponent extends BaseFormComponent {
    public record!: CompanyTypeEntity;
} 

export function LoadCompanyTypeFormComponent() {
    LoadCompanyTypeDetailsComponent();
}
