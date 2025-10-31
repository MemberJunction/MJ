import { Component } from '@angular/core';
import { Company__dboEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompany__dboDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Companies__dbo') // Tell MemberJunction about this class
@Component({
    selector: 'gen-company__dbo-form',
    templateUrl: './company__dbo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Company__dboFormComponent extends BaseFormComponent {
    public record!: Company__dboEntity;
} 

export function LoadCompany__dboFormComponent() {
    LoadCompany__dboDetailsComponent();
}
