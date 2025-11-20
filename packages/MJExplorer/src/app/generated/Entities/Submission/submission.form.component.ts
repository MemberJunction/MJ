import { Component } from '@angular/core';
import { SubmissionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Submissions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-submission-form',
    templateUrl: './submission.form.component.html'
})
export class SubmissionFormComponent extends BaseFormComponent {
    public record!: SubmissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'submissionNotifications', sectionName: 'Submission Notifications', isExpanded: false },
            { sectionKey: 'submissionSpeakers', sectionName: 'Submission Speakers', isExpanded: false },
            { sectionKey: 'submissions', sectionName: 'Submissions', isExpanded: false },
            { sectionKey: 'eventReviewTasks', sectionName: 'Event Review Tasks', isExpanded: false },
            { sectionKey: 'submissionReviews', sectionName: 'Submission Reviews', isExpanded: false }
        ]);
    }
}

export function LoadSubmissionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
