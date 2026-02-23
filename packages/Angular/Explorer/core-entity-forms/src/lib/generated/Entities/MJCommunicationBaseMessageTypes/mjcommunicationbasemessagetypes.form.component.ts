import { Component } from '@angular/core';
import { MJCommunicationBaseMessageTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Base Message Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationbasemessagetypes-form',
    templateUrl: './mjcommunicationbasemessagetypes.form.component.html'
})
export class MJCommunicationBaseMessageTypesFormComponent extends BaseFormComponent {
    public record!: MJCommunicationBaseMessageTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'messageTypeDetails', sectionName: 'Message Type Details', isExpanded: true },
            { sectionKey: 'supportedFeatures', sectionName: 'Supported Features', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'communicationProviderMessageTypes', sectionName: 'Communication Provider Message Types', isExpanded: false },
            { sectionKey: 'entityCommunicationMessageTypes', sectionName: 'Entity Communication Message Types', isExpanded: false }
        ]);
    }
}

