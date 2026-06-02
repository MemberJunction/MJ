import { Component } from '@angular/core';
import { hubspotconversation_inbox_channelsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Conversation Inbox Channels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotconversation_inbox_channels-form',
    templateUrl: './hubspotconversation_inbox_channels.form.component.html'
})
export class hubspotconversation_inbox_channelsFormComponent extends BaseFormComponent {
    public record!: hubspotconversation_inbox_channelsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'channelIdentification', sectionName: 'Channel Identification', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

