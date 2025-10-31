import { Component } from '@angular/core';
import { InventoryLocationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInventoryLocationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Inventory Locations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-inventorylocation-form',
    templateUrl: './inventorylocation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InventoryLocationFormComponent extends BaseFormComponent {
    public record!: InventoryLocationEntity;
} 

export function LoadInventoryLocationFormComponent() {
    LoadInventoryLocationDetailsComponent();
}
