import { Component } from '@angular/core';
import { OrderBoothProductCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderBoothProductCodeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Booth Product Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderboothproductcode-form',
    templateUrl: './orderboothproductcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderBoothProductCodeFormComponent extends BaseFormComponent {
    public record!: OrderBoothProductCodeEntity;
} 

export function LoadOrderBoothProductCodeFormComponent() {
    LoadOrderBoothProductCodeDetailsComponent();
}
