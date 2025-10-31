import { Component } from '@angular/core';
import { CompanyPersonEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyPersonDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Company Persons') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyperson-form',
    templateUrl: './companyperson.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyPersonFormComponent extends BaseFormComponent {
    public record!: CompanyPersonEntity;
} 

export function LoadCompanyPersonFormComponent() {
    LoadCompanyPersonDetailsComponent();
}
