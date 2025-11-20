import { Component } from '@angular/core';
import { ContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Contacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contact-form',
    templateUrl: './contact.form.component.html'
})
export class ContactFormComponent extends BaseFormComponent {
    public record!: ContactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'accountInsights', sectionName: 'Account Insights', isExpanded: false },
            { sectionKey: 'activities', sectionName: 'Activities', isExpanded: false },
            { sectionKey: 'contactRelationships', sectionName: 'Contact Relationships', isExpanded: false },
            { sectionKey: 'contacts', sectionName: 'Contacts', isExpanded: false },
            { sectionKey: 'deals', sectionName: 'Deals', isExpanded: false },
            { sectionKey: 'eventReviewTasks', sectionName: 'Event Review Tasks', isExpanded: false },
            { sectionKey: 'speakers', sectionName: 'Speakers', isExpanded: false },
            { sectionKey: 'submissionReviews', sectionName: 'Submission Reviews', isExpanded: false },
            { sectionKey: 'contactRelationships1', sectionName: 'Contact Relationships', isExpanded: false },
            { sectionKey: 'deals1', sectionName: 'Deals', isExpanded: false }
        ]);
    }
}

export function LoadContactFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
