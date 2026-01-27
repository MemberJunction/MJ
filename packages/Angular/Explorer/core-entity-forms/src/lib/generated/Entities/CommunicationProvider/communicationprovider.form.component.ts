import { Component } from '@angular/core';
import { CommunicationProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"
import { JoinGridComponent } from "@memberjunction/ng-join-grid"

@RegisterClass(BaseFormComponent, 'Communication Providers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationprovider-form',
    templateUrl: './communicationprovider.form.component.html'
})
export class CommunicationProviderFormComponent extends BaseFormComponent {
    public record!: CommunicationProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerDetails', sectionName: 'Provider Details', isExpanded: true },
            { sectionKey: 'operationalSettings', sectionName: 'Operational Settings', isExpanded: true },
            { sectionKey: 'advancedCapabilities', sectionName: 'Advanced Capabilities', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'communicationLogs', sectionName: 'Communication Logs', isExpanded: false },
            { sectionKey: 'messageTypes', sectionName: 'Message Types', isExpanded: false },
            { sectionKey: 'channelTypes', sectionName: 'Channel Types', isExpanded: false }
        ]);
    }
}

export function LoadCommunicationProviderFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
