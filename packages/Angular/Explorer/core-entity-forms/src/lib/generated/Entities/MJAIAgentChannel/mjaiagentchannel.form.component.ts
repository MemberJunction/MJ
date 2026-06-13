import { Component } from '@angular/core';
import { MJAIAgentChannelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Channels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentchannel-form',
    templateUrl: './mjaiagentchannel.form.component.html'
})
export class MJAIAgentChannelFormComponent extends BaseFormComponent {
    public record!: MJAIAgentChannelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'channelDefinition', sectionName: 'Channel Definition', isExpanded: true },
            { sectionKey: 'technicalConfiguration', sectionName: 'Technical Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentSessionChannels', sectionName: 'AI Agent Session Channels', isExpanded: false }
        ]);
    }
}

