import { Component } from '@angular/core';
import { OrderTotalEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderTotalDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Totals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordertotal-form',
    templateUrl: './ordertotal.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderTotalFormComponent extends BaseFormComponent {
    public record!: OrderTotalEntity;
} 

export function LoadOrderTotalFormComponent() {
    LoadOrderTotalDetailsComponent();
}
