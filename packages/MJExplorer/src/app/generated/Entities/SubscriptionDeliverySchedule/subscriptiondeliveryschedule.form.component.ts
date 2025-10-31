import { Component } from '@angular/core';
import { SubscriptionDeliveryScheduleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubscriptionDeliveryScheduleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Subscription Delivery Schedules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscriptiondeliveryschedule-form',
    templateUrl: './subscriptiondeliveryschedule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubscriptionDeliveryScheduleFormComponent extends BaseFormComponent {
    public record!: SubscriptionDeliveryScheduleEntity;
} 

export function LoadSubscriptionDeliveryScheduleFormComponent() {
    LoadSubscriptionDeliveryScheduleDetailsComponent();
}
