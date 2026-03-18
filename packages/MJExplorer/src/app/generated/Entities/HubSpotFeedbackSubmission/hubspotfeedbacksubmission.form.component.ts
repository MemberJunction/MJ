import { Component } from '@angular/core';
import { HubSpotFeedbackSubmissionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Feedback Submissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotfeedbacksubmission-form',
    templateUrl: './hubspotfeedbacksubmission.form.component.html'
})
export class HubSpotFeedbackSubmissionFormComponent extends BaseFormComponent {
    public record!: HubSpotFeedbackSubmissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'surveyInformation', sectionName: 'Survey Information', isExpanded: true },
            { sectionKey: 'responseDetails', sectionName: 'Response Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'contactFeedbackSubmissions', sectionName: 'Contact Feedback Submissions', isExpanded: false },
            { sectionKey: 'ticketFeedbackSubmissions', sectionName: 'Ticket Feedback Submissions', isExpanded: false }
        ]);
    }
}

