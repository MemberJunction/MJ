import { Component } from '@angular/core';
import { OrderSourceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderSourceDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Sources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordersource-form',
    templateUrl: './ordersource.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderSourceFormComponent extends BaseFormComponent {
    public record!: OrderSourceEntity;
} 

export function LoadOrderSourceFormComponent() {
    LoadOrderSourceDetailsComponent();
}
