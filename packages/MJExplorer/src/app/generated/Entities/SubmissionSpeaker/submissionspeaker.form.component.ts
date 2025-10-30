import { Component } from '@angular/core';
import { SubmissionSpeakerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubmissionSpeakerDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Submission Speakers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-submissionspeaker-form',
    templateUrl: './submissionspeaker.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubmissionSpeakerFormComponent extends BaseFormComponent {
    public record!: SubmissionSpeakerEntity;
} 

export function LoadSubmissionSpeakerFormComponent() {
    LoadSubmissionSpeakerDetailsComponent();
}
