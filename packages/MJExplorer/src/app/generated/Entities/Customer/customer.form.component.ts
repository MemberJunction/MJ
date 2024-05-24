import { Component } from '@angular/core';
import { CustomerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCustomerDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Customers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-customer-form',
    templateUrl: './customer.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CustomerFormComponent extends BaseFormComponent {
    public record!: CustomerEntity;
} 

export function LoadCustomerFormComponent() {
    LoadCustomerDetailsComponent();
}
