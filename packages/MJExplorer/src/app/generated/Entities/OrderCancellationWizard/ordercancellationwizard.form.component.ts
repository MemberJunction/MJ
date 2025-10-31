import { Component } from '@angular/core';
import { OrderCancellationWizardEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrderCancellationWizardDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Order Cancellation Wizards') // Tell MemberJunction about this class
@Component({
    selector: 'gen-ordercancellationwizard-form',
    templateUrl: './ordercancellationwizard.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrderCancellationWizardFormComponent extends BaseFormComponent {
    public record!: OrderCancellationWizardEntity;
} 

export function LoadOrderCancellationWizardFormComponent() {
    LoadOrderCancellationWizardDetailsComponent();
}
