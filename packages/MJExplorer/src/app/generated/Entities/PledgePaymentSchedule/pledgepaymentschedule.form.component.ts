import { Component } from '@angular/core';
import { PledgePaymentScheduleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPledgePaymentScheduleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Pledge Payment Schedules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-pledgepaymentschedule-form',
    templateUrl: './pledgepaymentschedule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PledgePaymentScheduleFormComponent extends BaseFormComponent {
    public record!: PledgePaymentScheduleEntity;
} 

export function LoadPledgePaymentScheduleFormComponent() {
    LoadPledgePaymentScheduleDetailsComponent();
}
