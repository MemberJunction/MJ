import { Component } from '@angular/core';
import { OrderBoothDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderBoothDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Booth Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderboothdetail-form',
    templateUrl: './orderboothdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderBoothDetailFormComponent extends BaseFormComponent {
    public record!: OrderBoothDetailEntity;
} 

export function LoadOrderBoothDetailFormComponent() {
    LoadOrderBoothDetailDetailsComponent();
}
