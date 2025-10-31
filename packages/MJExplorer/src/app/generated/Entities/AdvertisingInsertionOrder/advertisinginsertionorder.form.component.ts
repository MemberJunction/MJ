import { Component } from '@angular/core';
import { AdvertisingInsertionOrderEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAdvertisingInsertionOrderDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Advertising Insertion Orders') // Tell MemberJunction about this class
@Component({
    selector: 'gen-advertisinginsertionorder-form',
    templateUrl: './advertisinginsertionorder.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AdvertisingInsertionOrderFormComponent extends BaseFormComponent {
    public record!: AdvertisingInsertionOrderEntity;
} 

export function LoadAdvertisingInsertionOrderFormComponent() {
    LoadAdvertisingInsertionOrderDetailsComponent();
}
