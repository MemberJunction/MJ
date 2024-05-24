import { Component } from '@angular/core';
import { CustomerAddress__client_financeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCustomerAddress__client_financeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Customer Address__client_finance') // Tell MemberJunction about this class
@Component({
    selector: 'gen-customeraddress__client_finance-form',
    templateUrl: './customeraddress__client_finance.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CustomerAddress__client_financeFormComponent extends BaseFormComponent {
    public record!: CustomerAddress__client_financeEntity;
} 

export function LoadCustomerAddress__client_financeFormComponent() {
    LoadCustomerAddress__client_financeDetailsComponent();
}
