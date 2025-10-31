import { Component } from '@angular/core';
import { SubscriptionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubscriptionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Subscriptions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscription-form',
    templateUrl: './subscription.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubscriptionFormComponent extends BaseFormComponent {
    public record!: SubscriptionEntity;
} 

export function LoadSubscriptionFormComponent() {
    LoadSubscriptionDetailsComponent();
}
