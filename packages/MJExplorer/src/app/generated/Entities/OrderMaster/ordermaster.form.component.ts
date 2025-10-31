import { Component } from '@angular/core';
import { OrderMasterEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderMasterDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Masters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordermaster-form',
    templateUrl: './ordermaster.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderMasterFormComponent extends BaseFormComponent {
    public record!: OrderMasterEntity;
} 

export function LoadOrderMasterFormComponent() {
    LoadOrderMasterDetailsComponent();
}
