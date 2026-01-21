import { Component } from '@angular/core';
import { CommunicationProviderMessageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Communication Provider Message Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationprovidermessagetype-form',
    templateUrl: './communicationprovidermessagetype.form.component.html'
})
export class CommunicationProviderMessageTypeFormComponent extends BaseFormComponent {
    public record!: CommunicationProviderMessageTypeEntity;

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

export function LoadCommunicationProviderMessageTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
