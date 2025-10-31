import { Component } from '@angular/core';
import { ScheduledTransactionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScheduledTransactionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Scheduled Transactions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledtransaction-form',
    templateUrl: './scheduledtransaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledTransactionFormComponent extends BaseFormComponent {
    public record!: ScheduledTransactionEntity;
} 

export function LoadScheduledTransactionFormComponent() {
    LoadScheduledTransactionDetailsComponent();
}
