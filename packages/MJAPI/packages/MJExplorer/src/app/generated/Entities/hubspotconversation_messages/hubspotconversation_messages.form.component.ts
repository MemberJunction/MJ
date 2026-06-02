import { Component } from '@angular/core';
import { hubspotconversation_messagesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Conversation Messages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotconversation_messages-form',
    templateUrl: './hubspotconversation_messages.form.component.html'
})
export class hubspotconversation_messagesFormComponent extends BaseFormComponent {
    public record!: hubspotconversation_messagesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'messageContent', sectionName: 'Message Content', isExpanded: true },
            { sectionKey: 'deliveryAndStatus', sectionName: 'Delivery and Status', isExpanded: true },
            { sectionKey: 'messageDetails', sectionName: 'Message Details', isExpanded: false },
            { sectionKey: 'conversationContext', sectionName: 'Conversation Context', isExpanded: false },
            { sectionKey: 'senderInformation', sectionName: 'Sender Information', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

