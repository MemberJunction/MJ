import { Component } from '@angular/core';
import { OrderInvAllocationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderInvAllocationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Inv Allocations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderinvallocation-form',
    templateUrl: './orderinvallocation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderInvAllocationFormComponent extends BaseFormComponent {
    public record!: OrderInvAllocationEntity;
} 

export function LoadOrderInvAllocationFormComponent() {
    LoadOrderInvAllocationDetailsComponent();
}
