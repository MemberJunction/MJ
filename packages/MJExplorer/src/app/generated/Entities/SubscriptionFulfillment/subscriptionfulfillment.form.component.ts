import { Component } from '@angular/core';
import { SubscriptionFulfillmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubscriptionFulfillmentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Subscription Fulfillments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscriptionfulfillment-form',
    templateUrl: './subscriptionfulfillment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubscriptionFulfillmentFormComponent extends BaseFormComponent {
    public record!: SubscriptionFulfillmentEntity;
} 

export function LoadSubscriptionFulfillmentFormComponent() {
    LoadSubscriptionFulfillmentDetailsComponent();
}
