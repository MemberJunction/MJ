import { Component } from '@angular/core';
import { SubmissionNotificationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubmissionNotificationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Submission Notifications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-submissionnotification-form',
    templateUrl: './submissionnotification.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubmissionNotificationFormComponent extends BaseFormComponent {
    public record!: SubmissionNotificationEntity;
} 

export function LoadSubmissionNotificationFormComponent() {
    LoadSubmissionNotificationDetailsComponent();
}
