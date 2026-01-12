import { Component } from '@angular/core';
import { EmailSendEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Email Sends') // Tell MemberJunction about this class
@Component({
    selector: 'gen-emailsend-form',
    templateUrl: './emailsend.form.component.html'
})
export class EmailSendFormComponent extends BaseFormComponent {
    public record!: EmailSendEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiersStatus', sectionName: 'Identifiers & Status', isExpanded: true },
            { sectionKey: 'messageContext', sectionName: 'Message & Context', isExpanded: true },
            { sectionKey: 'sendDeliveryTimeline', sectionName: 'Send & Delivery Timeline', isExpanded: false },
            { sectionKey: 'engagementMetrics', sectionName: 'Engagement Metrics', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'emailClicks', sectionName: 'Email Clicks', isExpanded: false }
        ]);
    }
}

export function LoadEmailSendFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
