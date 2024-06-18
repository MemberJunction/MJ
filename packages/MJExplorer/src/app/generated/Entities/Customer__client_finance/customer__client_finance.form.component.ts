import { Component } from '@angular/core';
import { Customer__client_financeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCustomer__client_financeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Customers__client_finance') // Tell MemberJunction about this class
@Component({
    selector: 'gen-customer__client_finance-form',
    templateUrl: './customer__client_finance.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Customer__client_financeFormComponent extends BaseFormComponent {
    public record!: Customer__client_financeEntity;
} 

export function LoadCustomer__client_financeFormComponent() {
    LoadCustomer__client_financeDetailsComponent();
}
