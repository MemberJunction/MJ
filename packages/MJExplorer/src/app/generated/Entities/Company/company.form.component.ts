import { Component } from '@angular/core';
import { CompanyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadCompanyDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Companies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-company-form',
    templateUrl: './company.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyFormComponent extends BaseFormComponent {
    public record!: CompanyEntity;
} 

export function LoadCompanyFormComponent() {
    LoadCompanyDetailsComponent();
}
