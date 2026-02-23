import { Component } from '@angular/core';
import { MJCommunicationProvidersEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"
import { JoinGridComponent } from "@memberjunction/ng-join-grid"

@RegisterClass(BaseFormComponent, 'MJ: Communication Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationproviders-form',
    templateUrl: './mjcommunicationproviders.form.component.html'
})
export class MJCommunicationProvidersFormComponent extends BaseFormComponent {
    public record!: MJCommunicationProvidersEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerDetails', sectionName: 'Provider Details', isExpanded: true },
            { sectionKey: 'operationalSettings', sectionName: 'Operational Settings', isExpanded: true },
            { sectionKey: 'advancedCapabilities', sectionName: 'Advanced Capabilities', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'communicationLogs', sectionName: 'Communication Logs', isExpanded: false },
            { sectionKey: 'messageTypes', sectionName: 'Message Types', isExpanded: false }
        ]);
    }
}

