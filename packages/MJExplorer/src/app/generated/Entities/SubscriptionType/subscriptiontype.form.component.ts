import { Component } from '@angular/core';
import { SubscriptionTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubscriptionTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Subscription Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-subscriptiontype-form',
    templateUrl: './subscriptiontype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubscriptionTypeFormComponent extends BaseFormComponent {
    public record!: SubscriptionTypeEntity;
} 

export function LoadSubscriptionTypeFormComponent() {
    LoadSubscriptionTypeDetailsComponent();
}
