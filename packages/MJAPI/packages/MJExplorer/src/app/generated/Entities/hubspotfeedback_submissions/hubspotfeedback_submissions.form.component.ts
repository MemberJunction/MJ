import { Component } from '@angular/core';
import { hubspotfeedback_submissionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Feedback Submissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotfeedback_submissions-form',
    templateUrl: './hubspotfeedback_submissions.form.component.html'
})
export class hubspotfeedback_submissionsFormComponent extends BaseFormComponent {
    public record!: hubspotfeedback_submissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'surveyInformation', sectionName: 'Survey Information', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'submissionDetails', sectionName: 'Submission Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

