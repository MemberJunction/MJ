import { Component } from '@angular/core';
import { MJAgentChannelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Agent Channels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjagentchannel-form',
    templateUrl: './mjagentchannel.form.component.html'
})
export class MJAgentChannelFormComponent extends BaseFormComponent {
    public record!: MJAgentChannelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'channelDetails', sectionName: 'Channel Details', isExpanded: true },
            { sectionKey: 'rateLimitsAndCounters', sectionName: 'Rate Limits and Counters', isExpanded: true },
            { sectionKey: 'conversationsDetails', sectionName: 'Conversations Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAgentChannelParticipants', sectionName: 'Agent Channel Participants', isExpanded: false }
        ]);
    }
}

