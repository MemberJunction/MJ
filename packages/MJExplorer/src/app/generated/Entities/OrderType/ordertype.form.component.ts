import { Component } from '@angular/core';
import { OrderTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordertype-form',
    templateUrl: './ordertype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderTypeFormComponent extends BaseFormComponent {
    public record!: OrderTypeEntity;
} 

export function LoadOrderTypeFormComponent() {
    LoadOrderTypeDetailsComponent();
}
