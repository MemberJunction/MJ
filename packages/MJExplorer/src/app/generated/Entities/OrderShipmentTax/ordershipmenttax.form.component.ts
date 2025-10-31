import { Component } from '@angular/core';
import { OrderShipmentTaxEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderShipmentTaxDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Shipment Taxes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordershipmenttax-form',
    templateUrl: './ordershipmenttax.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderShipmentTaxFormComponent extends BaseFormComponent {
    public record!: OrderShipmentTaxEntity;
} 

export function LoadOrderShipmentTaxFormComponent() {
    LoadOrderShipmentTaxDetailsComponent();
}
