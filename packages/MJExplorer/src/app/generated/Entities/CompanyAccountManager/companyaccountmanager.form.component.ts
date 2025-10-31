import { Component } from '@angular/core';
import { CompanyAccountManagerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyAccountManagerDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Account Managers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyaccountmanager-form',
    templateUrl: './companyaccountmanager.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyAccountManagerFormComponent extends BaseFormComponent {
    public record!: CompanyAccountManagerEntity;
} 

export function LoadCompanyAccountManagerFormComponent() {
    LoadCompanyAccountManagerDetailsComponent();
}
