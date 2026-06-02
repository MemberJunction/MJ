import { Component } from '@angular/core';
import { hubspotform_submissionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Form Submissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotform_submissions-form',
    templateUrl: './hubspotform_submissions.form.component.html'
})
export class hubspotform_submissionsFormComponent extends BaseFormComponent {
    public record!: hubspotform_submissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'trackingAndIdentity', sectionName: 'Tracking and Identity', isExpanded: true },
            { sectionKey: 'submissionContext', sectionName: 'Submission Context', isExpanded: true },
            { sectionKey: 'submissionData', sectionName: 'Submission Data', isExpanded: false },
            { sectionKey: 'submissionDetails', sectionName: 'Submission Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

