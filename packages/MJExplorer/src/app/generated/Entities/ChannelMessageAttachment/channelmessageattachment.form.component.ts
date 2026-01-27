import { Component } from '@angular/core';
import { ChannelMessageAttachmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Channel Message Attachments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channelmessageattachment-form',
    templateUrl: './channelmessageattachment.form.component.html'
})
export class ChannelMessageAttachmentFormComponent extends BaseFormComponent {
    public record!: ChannelMessageAttachmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkageSystem', sectionName: 'Linkage & System', isExpanded: true },
            { sectionKey: 'attachmentDetails', sectionName: 'Attachment Details', isExpanded: true },
            { sectionKey: 'storageInlineSettings', sectionName: 'Storage & Inline Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadChannelMessageAttachmentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
