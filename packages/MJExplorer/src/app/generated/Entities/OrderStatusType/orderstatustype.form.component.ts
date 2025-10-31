import { Component } from '@angular/core';
import { OrderStatusTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderStatusTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Status Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderstatustype-form',
    templateUrl: './orderstatustype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderStatusTypeFormComponent extends BaseFormComponent {
    public record!: OrderStatusTypeEntity;
} 

export function LoadOrderStatusTypeFormComponent() {
    LoadOrderStatusTypeDetailsComponent();
}
