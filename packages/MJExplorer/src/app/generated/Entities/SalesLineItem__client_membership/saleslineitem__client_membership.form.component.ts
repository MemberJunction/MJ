import { Component } from '@angular/core';
import { SalesLineItem__client_membershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesLineItem__client_membershipDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Sales Line Items__client_membership') // Tell MemberJunction about this class
@Component({
    selector: 'gen-saleslineitem__client_membership-form',
    templateUrl: './saleslineitem__client_membership.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesLineItem__client_membershipFormComponent extends BaseFormComponent {
    public record!: SalesLineItem__client_membershipEntity;
} 

export function LoadSalesLineItem__client_membershipFormComponent() {
    LoadSalesLineItem__client_membershipDetailsComponent();
}
