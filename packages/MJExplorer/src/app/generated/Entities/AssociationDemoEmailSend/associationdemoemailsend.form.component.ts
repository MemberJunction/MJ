import { Component } from '@angular/core';
import { AssociationDemoEmailSendEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Email Sends') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoemailsend-form',
    templateUrl: './associationdemoemailsend.form.component.html'
})
export class AssociationDemoEmailSendFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEmailSendEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'campaignContext', sectionName: 'Campaign Context', isExpanded: true },
            { sectionKey: 'emailDetails', sectionName: 'Email Details', isExpanded: true },
            { sectionKey: 'engagementTimeline', sectionName: 'Engagement Timeline', isExpanded: false },
            { sectionKey: 'engagementMetrics', sectionName: 'Engagement Metrics', isExpanded: false },
            { sectionKey: 'deliveryIssues', sectionName: 'Delivery Issues', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'emailClicks', sectionName: 'Email Clicks', isExpanded: false }
        ]);
    }
}

