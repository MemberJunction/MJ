import { Component } from '@angular/core';
import { ScheduledActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScheduledActionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Scheduled Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledaction-form',
    templateUrl: './scheduledaction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledActionFormComponent extends BaseFormComponent {
    public record!: ScheduledActionEntity;
} 

export function LoadScheduledActionFormComponent() {
    LoadScheduledActionDetailsComponent();
}
