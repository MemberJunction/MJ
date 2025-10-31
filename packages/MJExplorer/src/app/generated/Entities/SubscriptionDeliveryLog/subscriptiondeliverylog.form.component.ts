import { Component } from '@angular/core';
import { SubscriptionDeliveryLogEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubscriptionDeliveryLogDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Subscription Delivery Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscriptiondeliverylog-form',
    templateUrl: './subscriptiondeliverylog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubscriptionDeliveryLogFormComponent extends BaseFormComponent {
    public record!: SubscriptionDeliveryLogEntity;
} 

export function LoadSubscriptionDeliveryLogFormComponent() {
    LoadSubscriptionDeliveryLogDetailsComponent();
}
