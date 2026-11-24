import { Component } from '@angular/core';
import { MJCommunicationPrincipalPreferenceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Principal Preferences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationprincipalpreference-form',
    templateUrl: './mjcommunicationprincipalpreference.form.component.html'
})
export class MJCommunicationPrincipalPreferenceFormComponent extends BaseFormComponent {
    public record!: MJCommunicationPrincipalPreferenceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationConsentAuditLogs', sectionName: 'Communication Consent Audit Logs', isExpanded: false }
        ]);
    }
}

