import { Component } from '@angular/core';
import { MJCommunicationBaseMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Base Message Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationbasemessagetype-form',
    templateUrl: './mjcommunicationbasemessagetype.form.component.html'
})
export class MJCommunicationBaseMessageTypeFormComponent extends BaseFormComponent {
    public record!: MJCommunicationBaseMessageTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'messageTypeDetails', sectionName: 'Message Type Details', isExpanded: true },
            { sectionKey: 'supportedFeatures', sectionName: 'Supported Features', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCommunicationProviderMessageTypes', sectionName: 'Communication Provider Message Types', isExpanded: false },
            { sectionKey: 'mJEntityCommunicationMessageTypes', sectionName: 'Entity Communication Message Types', isExpanded: false }
        ]);
    }
}

