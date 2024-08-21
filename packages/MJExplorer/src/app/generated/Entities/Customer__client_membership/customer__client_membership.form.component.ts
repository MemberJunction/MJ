import { Component } from '@angular/core';
import { Customer__client_membershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCustomer__client_membershipDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Customers__client_membership') // Tell MemberJunction about this class
@Component({
    selector: 'gen-customer__client_membership-form',
    templateUrl: './customer__client_membership.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Customer__client_membershipFormComponent extends BaseFormComponent {
    public record!: Customer__client_membershipEntity;
} 

export function LoadCustomer__client_membershipFormComponent() {
    LoadCustomer__client_membershipDetailsComponent();
}
