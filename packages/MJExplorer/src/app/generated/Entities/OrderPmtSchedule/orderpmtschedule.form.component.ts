import { Component } from '@angular/core';
import { OrderPmtScheduleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderPmtScheduleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Order Pmt Schedules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-orderpmtschedule-form',
    templateUrl: './orderpmtschedule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderPmtScheduleFormComponent extends BaseFormComponent {
    public record!: OrderPmtScheduleEntity;
} 

export function LoadOrderPmtScheduleFormComponent() {
    LoadOrderPmtScheduleDetailsComponent();
}
