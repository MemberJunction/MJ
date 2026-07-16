import { Component } from '@angular/core';
import { constantcontactemailsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Emails') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactemails-form',
    templateUrl: './constantcontactemails.form.component.html'
})
export class constantcontactemailsFormComponent extends BaseFormComponent {
    public record!: constantcontactemailsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'eventsCopies', sectionName: 'Events Copies', isExpanded: false },
            { sectionKey: 'socialPosts', sectionName: 'Social Posts', isExpanded: false },
            { sectionKey: 'emailCampaignActivities', sectionName: 'Email Campaign Activities', isExpanded: false },
            { sectionKey: 'emailsXrefs', sectionName: 'Emails Xrefs', isExpanded: false },
            { sectionKey: 'emailReportsSummaries', sectionName: 'Email Reports Summaries', isExpanded: false },
            { sectionKey: 'events', sectionName: 'Events', isExpanded: false }
        ]);
    }
}

