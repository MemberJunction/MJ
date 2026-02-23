import { Component } from '@angular/core';
import { MJCommunicationProviderMessageTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Provider Message Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationprovidermessagetypes-form',
    templateUrl: './mjcommunicationprovidermessagetypes.form.component.html'
})
export class MJCommunicationProviderMessageTypesFormComponent extends BaseFormComponent {
    public record!: MJCommunicationProviderMessageTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerMapping', sectionName: 'Provider Mapping', isExpanded: true },
            { sectionKey: 'messageTypeDefinition', sectionName: 'Message Type Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'communicationLogs', sectionName: 'Communication Logs', isExpanded: false }
        ]);
    }
}

