import { Component } from '@angular/core';
import { MJAIBridgeProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Bridge Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaibridgeprovider-form',
    templateUrl: './mjaibridgeprovider.form.component.html'
})
export class MJAIBridgeProviderFormComponent extends BaseFormComponent {
    public record!: MJAIBridgeProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerInformation', sectionName: 'Provider Information', isExpanded: true },
            { sectionKey: 'providerConfiguration', sectionName: 'Provider Configuration', isExpanded: true },
            { sectionKey: 'technicalCapabilities', sectionName: 'Technical Capabilities', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentSessionBridges', sectionName: 'AI Agent Session Bridges', isExpanded: false },
            { sectionKey: 'mJAIBridgeProviderChannels', sectionName: 'AI Bridge Provider Channels', isExpanded: false },
            { sectionKey: 'mJAIBridgeAgentIdentities', sectionName: 'AI Bridge Agent Identities', isExpanded: false }
        ]);
    }
}

