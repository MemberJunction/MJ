import { Component } from '@angular/core';
import { CompanyTaxExCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyTaxExCodeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Tax Ex Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companytaxexcode-form',
    templateUrl: './companytaxexcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyTaxExCodeFormComponent extends BaseFormComponent {
    public record!: CompanyTaxExCodeEntity;
} 

export function LoadCompanyTaxExCodeFormComponent() {
    LoadCompanyTaxExCodeDetailsComponent();
}
