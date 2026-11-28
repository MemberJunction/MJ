import { Component } from '@angular/core';
import { MJCommunicationSuppressionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Suppressions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationsuppression-form',
    templateUrl: './mjcommunicationsuppression.form.component.html'
})
export class MJCommunicationSuppressionFormComponent extends BaseFormComponent {
    public record!: MJCommunicationSuppressionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationConsentAuditLogs', sectionName: 'Communication Consent Audit Logs', isExpanded: false }
        ]);
    }
}

