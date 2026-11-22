import { Component } from '@angular/core';
import { MJCommunicationPreferenceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Preferences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationpreference-form',
    templateUrl: './mjcommunicationpreference.form.component.html'
})
export class MJCommunicationPreferenceFormComponent extends BaseFormComponent {
    public record!: MJCommunicationPreferenceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationLogs', sectionName: 'Communication Logs', isExpanded: false },
            { sectionKey: 'mJCommunicationSuppressions', sectionName: 'Communication Suppressions', isExpanded: false },
            { sectionKey: 'mJCommunicationPrincipalPreferences', sectionName: 'Communication Principal Preferences', isExpanded: false }
        ]);
    }
}

