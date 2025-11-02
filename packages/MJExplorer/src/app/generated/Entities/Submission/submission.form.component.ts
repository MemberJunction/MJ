import { Component } from '@angular/core';
import { SubmissionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadSubmissionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Submissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-submission-form',
    templateUrl: './submission.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class SubmissionFormComponent extends BaseFormComponent {
    public record!: SubmissionEntity;
} 

export function LoadSubmissionFormComponent() {
    LoadSubmissionDetailsComponent();
}
