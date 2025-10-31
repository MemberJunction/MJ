import { Component } from '@angular/core';
import { CompanyPersonFunctionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyPersonFunctionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Person Functions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companypersonfunction-form',
    templateUrl: './companypersonfunction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyPersonFunctionFormComponent extends BaseFormComponent {
    public record!: CompanyPersonFunctionEntity;
} 

export function LoadCompanyPersonFunctionFormComponent() {
    LoadCompanyPersonFunctionDetailsComponent();
}
