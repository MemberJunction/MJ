import { Component } from '@angular/core';
import { OrderStateEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderStateDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order States') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderstate-form',
    templateUrl: './orderstate.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderStateFormComponent extends BaseFormComponent {
    public record!: OrderStateEntity;
} 

export function LoadOrderStateFormComponent() {
    LoadOrderStateDetailsComponent();
}
