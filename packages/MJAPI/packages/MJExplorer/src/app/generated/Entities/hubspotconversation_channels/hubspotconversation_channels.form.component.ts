import { Component } from '@angular/core';
import { hubspotconversation_channelsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Conversation Channels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotconversation_channels-form',
    templateUrl: './hubspotconversation_channels.form.component.html'
})
export class hubspotconversation_channelsFormComponent extends BaseFormComponent {
    public record!: hubspotconversation_channelsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'channelDetails', sectionName: 'Channel Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

