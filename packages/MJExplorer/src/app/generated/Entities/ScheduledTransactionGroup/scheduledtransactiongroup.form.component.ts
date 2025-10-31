import { Component } from '@angular/core';
import { ScheduledTransactionGroupEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScheduledTransactionGroupDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Scheduled Transaction Groups') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledtransactiongroup-form',
    templateUrl: './scheduledtransactiongroup.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledTransactionGroupFormComponent extends BaseFormComponent {
    public record!: ScheduledTransactionGroupEntity;
} 

export function LoadScheduledTransactionGroupFormComponent() {
    LoadScheduledTransactionGroupDetailsComponent();
}
