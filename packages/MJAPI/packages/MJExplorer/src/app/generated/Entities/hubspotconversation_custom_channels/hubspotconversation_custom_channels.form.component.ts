import { Component } from '@angular/core';
import { hubspotconversation_custom_channelsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Conversation Custom Channels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotconversation_custom_channels-form',
    templateUrl: './hubspotconversation_custom_channels.form.component.html'
})
export class hubspotconversation_custom_channelsFormComponent extends BaseFormComponent {
    public record!: hubspotconversation_custom_channelsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'channelConfiguration', sectionName: 'Channel Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

