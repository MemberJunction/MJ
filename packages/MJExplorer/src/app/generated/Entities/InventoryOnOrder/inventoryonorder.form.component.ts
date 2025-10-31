import { Component } from '@angular/core';
import { InventoryOnOrderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInventoryOnOrderDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Inventory On Orders') // Tell MemberJunction about this class
@Component({
    selector: 'gen-inventoryonorder-form',
    templateUrl: './inventoryonorder.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InventoryOnOrderFormComponent extends BaseFormComponent {
    public record!: InventoryOnOrderEntity;
} 

export function LoadInventoryOnOrderFormComponent() {
    LoadInventoryOnOrderDetailsComponent();
}
