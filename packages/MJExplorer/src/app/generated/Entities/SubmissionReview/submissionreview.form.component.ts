import { Component } from '@angular/core';
import { SubmissionReviewEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubmissionReviewDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Submission Reviews') // Tell MemberJunction about this class
@Component({
    selector: 'gen-submissionreview-form',
    templateUrl: './submissionreview.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubmissionReviewFormComponent extends BaseFormComponent {
    public record!: SubmissionReviewEntity;
} 

export function LoadSubmissionReviewFormComponent() {
    LoadSubmissionReviewDetailsComponent();
}
