import { Component } from '@angular/core';
import { EventReviewTaskEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEventReviewTaskDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Event Review Tasks') // Tell MemberJunction about this class
@Component({
    selector: 'gen-eventreviewtask-form',
    templateUrl: './eventreviewtask.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EventReviewTaskFormComponent extends BaseFormComponent {
    public record!: EventReviewTaskEntity;
} 

export function LoadEventReviewTaskFormComponent() {
    LoadEventReviewTaskDetailsComponent();
}
