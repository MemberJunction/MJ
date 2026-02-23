import { Component } from '@angular/core';
import { MJConversationDetailAttachmentsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Conversation Detail Attachments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjconversationdetailattachments-form',
    templateUrl: './mjconversationdetailattachments.form.component.html'
})
export class MJConversationDetailAttachmentsFormComponent extends BaseFormComponent {
    public record!: MJConversationDetailAttachmentsEntity;

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

