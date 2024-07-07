import { Component } from '@angular/core';
import { ScheduledActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScheduledActionParamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Scheduled Action Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledactionparam-form',
    templateUrl: './scheduledactionparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledActionParamFormComponent extends BaseFormComponent {
    public record!: ScheduledActionParamEntity;
} 

export function LoadScheduledActionParamFormComponent() {
    LoadScheduledActionParamDetailsComponent();
}
