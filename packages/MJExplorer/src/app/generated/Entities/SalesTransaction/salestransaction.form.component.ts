import { Component } from '@angular/core';
import { SalesTransactionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSalesTransactionDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Sales Transactions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-salestransaction-form',
    templateUrl: './salestransaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SalesTransactionFormComponent extends BaseFormComponent {
    public record!: SalesTransactionEntity;
} 

export function LoadSalesTransactionFormComponent() {
    LoadSalesTransactionDetailsComponent();
}
