import { Component } from '@angular/core';
import { hubspotassoc_tickets_feedback_submissionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Assoc Tickets Feedback Submissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotassoc_tickets_feedback_submissions-form',
    templateUrl: './hubspotassoc_tickets_feedback_submissions.form.component.html'
})
export class hubspotassoc_tickets_feedback_submissionsFormComponent extends BaseFormComponent {
    public record!: hubspotassoc_tickets_feedback_submissionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associationDetails', sectionName: 'Association Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

