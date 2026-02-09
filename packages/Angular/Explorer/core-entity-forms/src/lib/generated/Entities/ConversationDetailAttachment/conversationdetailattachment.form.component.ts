import { Component } from '@angular/core';
import { ConversationDetailAttachmentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Attachments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-conversationdetailattachment-form',
    templateUrl: './conversationdetailattachment.form.component.html'
})
export class ConversationDetailAttachmentFormComponent extends BaseFormComponent {
    public record!: ConversationDetailAttachmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'attachmentMetadata', sectionName: 'Attachment Metadata', isExpanded: false },
            { sectionKey: 'mediaProperties', sectionName: 'Media Properties', isExpanded: true },
            { sectionKey: 'storageDetails', sectionName: 'Storage Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

