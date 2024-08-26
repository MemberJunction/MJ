import { Component } from '@angular/core';
import { CustomerAddress__client_membershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCustomerAddress__client_membershipDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Customer Address__client_membership') // Tell MemberJunction about this class
@Component({
    selector: 'gen-customeraddress__client_membership-form',
    templateUrl: './customeraddress__client_membership.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CustomerAddress__client_membershipFormComponent extends BaseFormComponent {
    public record!: CustomerAddress__client_membershipEntity;
} 

export function LoadCustomerAddress__client_membershipFormComponent() {
    LoadCustomerAddress__client_membershipDetailsComponent();
}
