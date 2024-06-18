import { Component } from '@angular/core';
import { CustomerAddressEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCustomerAddressDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Customer Address') // Tell MemberJunction about this class
@Component({
    selector: 'gen-customeraddress-form',
    templateUrl: './customeraddress.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CustomerAddressFormComponent extends BaseFormComponent {
    public record!: CustomerAddressEntity;
} 

export function LoadCustomerAddressFormComponent() {
    LoadCustomerAddressDetailsComponent();
}
