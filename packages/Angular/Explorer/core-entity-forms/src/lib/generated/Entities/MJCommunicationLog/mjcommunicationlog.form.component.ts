import { Component } from '@angular/core';
import { MJCommunicationLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationlog-form',
    templateUrl: './mjcommunicationlog.form.component.html'
})
export class MJCommunicationLogFormComponent extends BaseFormComponent {
    public record!: MJCommunicationLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'messageIdentification', sectionName: 'Message Identification', isExpanded: true },
            { sectionKey: 'messageDetails', sectionName: 'Message Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCommunicationPrincipalPreferences', sectionName: 'Communication Principal Preferences', isExpanded: false },
            { sectionKey: 'mJCommunicationActivities', sectionName: 'Communication Activities', isExpanded: false },
            { sectionKey: 'mJCommunicationConsentAuditLogs', sectionName: 'Communication Consent Audit Logs', isExpanded: false },
            { sectionKey: 'mJCommunicationSuppressions', sectionName: 'Communication Suppressions', isExpanded: false }
        ]);
    }
}

