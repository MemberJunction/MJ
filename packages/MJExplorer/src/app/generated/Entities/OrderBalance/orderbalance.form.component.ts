import { Component } from '@angular/core';
import { OrderBalanceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderBalanceDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Balances') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderbalance-form',
    templateUrl: './orderbalance.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderBalanceFormComponent extends BaseFormComponent {
    public record!: OrderBalanceEntity;
} 

export function LoadOrderBalanceFormComponent() {
    LoadOrderBalanceDetailsComponent();
}
