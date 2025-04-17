import { Component } from '@angular/core';
import { Company__membershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompany__membershipDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Companies__membership') // Tell MemberJunction about this class
@Component({
    selector: 'gen-company__membership-form',
    templateUrl: './company__membership.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Company__membershipFormComponent extends BaseFormComponent {
    public record!: Company__membershipEntity;
} 

export function LoadCompany__membershipFormComponent() {
    LoadCompany__membershipDetailsComponent();
}
