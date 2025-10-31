import { Component } from '@angular/core';
import { ProductInvLedgerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProductInvLedgerDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Product Inv Ledgers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-productinvledger-form',
    templateUrl: './productinvledger.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProductInvLedgerFormComponent extends BaseFormComponent {
    public record!: ProductInvLedgerEntity;
} 

export function LoadProductInvLedgerFormComponent() {
    LoadProductInvLedgerDetailsComponent();
}
