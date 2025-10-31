import { Component } from '@angular/core';
import { SubscriptionPurchaseTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubscriptionPurchaseTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Subscription Purchase Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscriptionpurchasetype-form',
    templateUrl: './subscriptionpurchasetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubscriptionPurchaseTypeFormComponent extends BaseFormComponent {
    public record!: SubscriptionPurchaseTypeEntity;
} 

export function LoadSubscriptionPurchaseTypeFormComponent() {
    LoadSubscriptionPurchaseTypeDetailsComponent();
}
