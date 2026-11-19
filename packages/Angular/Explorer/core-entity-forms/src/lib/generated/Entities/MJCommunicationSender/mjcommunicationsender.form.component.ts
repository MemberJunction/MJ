import { Component } from '@angular/core';
import { MJCommunicationSenderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Senders') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationsender-form',
    templateUrl: './mjcommunicationsender.form.component.html'
})
export class MJCommunicationSenderFormComponent extends BaseFormComponent {
    public record!: MJCommunicationSenderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationPreferences', sectionName: 'Communication Preferences', isExpanded: false },
            { sectionKey: 'mJCommunicationActivities', sectionName: 'Communication Activities', isExpanded: false },
            { sectionKey: 'mJCommunicationSuppressions', sectionName: 'Communication Suppressions', isExpanded: false },
            { sectionKey: 'mJCommunicationLogs', sectionName: 'Communication Logs', isExpanded: false },
            { sectionKey: 'mJCommunicationPrincipalPreferences', sectionName: 'Communication Principal Preferences', isExpanded: false },
            { sectionKey: 'mJCommunicationSenderPermissions', sectionName: 'Communication Sender Permissions', isExpanded: false },
            { sectionKey: 'mJCommunicationSenders', sectionName: 'Communication Senders', isExpanded: false }
        ]);
    }
}

