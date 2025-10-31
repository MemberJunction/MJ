import { Component } from '@angular/core';
import { OrderDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderdetail-form',
    templateUrl: './orderdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderDetailFormComponent extends BaseFormComponent {
    public record!: OrderDetailEntity;
} 

export function LoadOrderDetailFormComponent() {
    LoadOrderDetailDetailsComponent();
}
