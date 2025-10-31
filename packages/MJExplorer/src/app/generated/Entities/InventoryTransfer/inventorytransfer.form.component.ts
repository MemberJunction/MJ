import { Component } from '@angular/core';
import { InventoryTransferEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInventoryTransferDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Inventory Transfers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-inventorytransfer-form',
    templateUrl: './inventorytransfer.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InventoryTransferFormComponent extends BaseFormComponent {
    public record!: InventoryTransferEntity;
} 

export function LoadInventoryTransferFormComponent() {
    LoadInventoryTransferDetailsComponent();
}
