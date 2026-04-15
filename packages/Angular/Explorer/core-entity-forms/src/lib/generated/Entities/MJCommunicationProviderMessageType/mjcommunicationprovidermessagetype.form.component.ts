import { Component } from '@angular/core';
import { MJCommunicationProviderMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Provider Message Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationprovidermessagetype-form',
    templateUrl: './mjcommunicationprovidermessagetype.form.component.html'
})
export class MJCommunicationProviderMessageTypeFormComponent extends BaseFormComponent {
    public record!: MJCommunicationProviderMessageTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerMapping', sectionName: 'Provider Mapping', isExpanded: true },
            { sectionKey: 'messageTypeDefinition', sectionName: 'Message Type Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCommunicationLogs', sectionName: 'Communication Logs', isExpanded: false }
        ]);
    }
}

