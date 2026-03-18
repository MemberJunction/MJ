import { Component } from '@angular/core';
import { HubSpotTicketFeedbackSubmissionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Ticket Feedback Submissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotticketfeedbacksubmission-form',
    templateUrl: './hubspotticketfeedbacksubmission.form.component.html'
})
export class HubSpotTicketFeedbackSubmissionFormComponent extends BaseFormComponent {
    public record!: HubSpotTicketFeedbackSubmissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'submissionRelationships', sectionName: 'Submission Relationships', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

