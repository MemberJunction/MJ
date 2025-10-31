import { Component } from '@angular/core';
import { ProductInventoryLedgerEntryTransactionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductInventoryLedgerEntryTransactionsDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Product Inventory Ledger Entry Transactions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productinventoryledgerentrytransactions-form',
    templateUrl: './productinventoryledgerentrytransactions.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductInventoryLedgerEntryTransactionsFormComponent extends BaseFormComponent {
    public record!: ProductInventoryLedgerEntryTransactionsEntity;
} 

export function LoadProductInventoryLedgerEntryTransactionsFormComponent() {
    LoadProductInventoryLedgerEntryTransactionsDetailsComponent();
}
