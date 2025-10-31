import { Component } from '@angular/core';
import { ProdInvLedgerEntryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadProdInvLedgerEntryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Prod Inv Ledger Entries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-prodinvledgerentry-form',
    templateUrl: './prodinvledgerentry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ProdInvLedgerEntryFormComponent extends BaseFormComponent {
    public record!: ProdInvLedgerEntryEntity;
} 

export function LoadProdInvLedgerEntryFormComponent() {
    LoadProdInvLedgerEntryDetailsComponent();
}
