import { Component } from '@angular/core';
import { CompanyRelationshipTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyRelationshipTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Company Relationship Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyrelationshiptype-form',
    templateUrl: './companyrelationshiptype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyRelationshipTypeFormComponent extends BaseFormComponent {
    public record!: CompanyRelationshipTypeEntity;
} 

export function LoadCompanyRelationshipTypeFormComponent() {
    LoadCompanyRelationshipTypeDetailsComponent();
}
