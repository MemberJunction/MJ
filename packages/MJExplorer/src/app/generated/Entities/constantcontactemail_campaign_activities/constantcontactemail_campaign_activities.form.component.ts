import { Component } from '@angular/core';
import { constantcontactemail_campaign_activitiesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Email Campaign Activities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactemail_campaign_activities-form',
    templateUrl: './constantcontactemail_campaign_activities.form.component.html'
})
export class constantcontactemail_campaign_activitiesFormComponent extends BaseFormComponent {
    public record!: constantcontactemail_campaign_activitiesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'emailCampaignActivityPreviews', sectionName: 'Email Campaign Activity Previews', isExpanded: false },
            { sectionKey: 'emailsXrefs', sectionName: 'Emails Xrefs', isExpanded: false },
            { sectionKey: 'contactReportsActivitySummaries', sectionName: 'Contact Reports Activity Summaries', isExpanded: false }
        ]);
    }
}

