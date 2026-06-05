import { Component } from '@angular/core';
import { MJSignatureRequestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Signature Requests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsignaturerequest-form',
    templateUrl: './mjsignaturerequest.form.component.html'
})
export class MJSignatureRequestFormComponent extends BaseFormComponent {
    public record!: MJSignatureRequestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'signatureAccount', sectionName: 'Signature Account', isExpanded: true },
            { sectionKey: 'envelopeContent', sectionName: 'Envelope Content', isExpanded: true },
            { sectionKey: 'envelopeLifecycle', sectionName: 'Envelope Lifecycle', isExpanded: true },
            { sectionKey: 'envelopeIntegration', sectionName: 'Envelope Integration', isExpanded: true },
            { sectionKey: 'polymorphicReference', sectionName: 'Polymorphic Reference', isExpanded: true },
            { sectionKey: 'envelopeTimeline', sectionName: 'Envelope Timeline', isExpanded: true },
            { sectionKey: 'envelopeOutcome', sectionName: 'Envelope Outcome', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJSignatureRequestLogs', sectionName: 'Signature Request Logs', isExpanded: false },
            { sectionKey: 'mJSignatureRequestRecipients', sectionName: 'Signature Request Recipients', isExpanded: false },
            { sectionKey: 'mJSignatureRequestDocuments', sectionName: 'Signature Request Documents', isExpanded: false }
        ]);
    }
}

