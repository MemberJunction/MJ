import { Component } from '@angular/core';
import { SubscriptionStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubscriptionStatusDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Subscription Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscriptionstatus-form',
    templateUrl: './subscriptionstatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubscriptionStatusFormComponent extends BaseFormComponent {
    public record!: SubscriptionStatusEntity;
} 

export function LoadSubscriptionStatusFormComponent() {
    LoadSubscriptionStatusDetailsComponent();
}
