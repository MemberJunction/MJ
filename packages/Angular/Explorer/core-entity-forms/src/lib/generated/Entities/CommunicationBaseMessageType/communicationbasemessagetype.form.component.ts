import { Component } from '@angular/core';
import { CommunicationBaseMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Communication Base Message Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-communicationbasemessagetype-form',
    templateUrl: './communicationbasemessagetype.form.component.html'
})
export class CommunicationBaseMessageTypeFormComponent extends BaseFormComponent {
    public record!: CommunicationBaseMessageTypeEntity;

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

export function LoadCommunicationBaseMessageTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
