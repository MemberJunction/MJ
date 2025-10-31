import { Component } from '@angular/core';
import { SubscriptionPurchaseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubscriptionPurchaseDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Subscription Purchases') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscriptionpurchase-form',
    templateUrl: './subscriptionpurchase.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubscriptionPurchaseFormComponent extends BaseFormComponent {
    public record!: SubscriptionPurchaseEntity;
} 

export function LoadSubscriptionPurchaseFormComponent() {
    LoadSubscriptionPurchaseDetailsComponent();
}
