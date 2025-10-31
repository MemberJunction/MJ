import { Component } from '@angular/core';
import { OrderShipmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderShipmentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Shipments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordershipment-form',
    templateUrl: './ordershipment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderShipmentFormComponent extends BaseFormComponent {
    public record!: OrderShipmentEntity;
} 

export function LoadOrderShipmentFormComponent() {
    LoadOrderShipmentDetailsComponent();
}
