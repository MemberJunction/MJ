import { Component } from '@angular/core';
import { HubSpotContactFeedbackSubmissionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Contact Feedback Submissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcontactfeedbacksubmission-form',
    templateUrl: './hubspotcontactfeedbacksubmission.form.component.html'
})
export class HubSpotContactFeedbackSubmissionFormComponent extends BaseFormComponent {
    public record!: HubSpotContactFeedbackSubmissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

