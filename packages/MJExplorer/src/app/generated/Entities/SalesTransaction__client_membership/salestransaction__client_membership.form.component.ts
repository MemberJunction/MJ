import { Component } from '@angular/core';
import { SalesTransaction__client_membershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesTransaction__client_membershipDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Sales Transactions__client_membership') // Tell MemberJunction about this class
@Component({
    selector: 'gen-salestransaction__client_membership-form',
    templateUrl: './salestransaction__client_membership.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesTransaction__client_membershipFormComponent extends BaseFormComponent {
    public record!: SalesTransaction__client_membershipEntity;
} 

export function LoadSalesTransaction__client_membershipFormComponent() {
    LoadSalesTransaction__client_membershipDetailsComponent();
}
