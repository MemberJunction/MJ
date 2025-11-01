import { Component } from '@angular/core';
import { SubmissionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@Component({
  selector: 'mj-submission-form',
  templateUrl: './submission-form.component.html',
  styleUrls: ['../shared/form-styles.css']
})
@RegisterClass(BaseFormComponent, 'Submissions')
export class SubmissionFormComponent extends BaseFormComponent {
  public record!: SubmissionEntity;
}

export function LoadSubmissionFormComponent() {
  // Tree-shaking prevention
}
