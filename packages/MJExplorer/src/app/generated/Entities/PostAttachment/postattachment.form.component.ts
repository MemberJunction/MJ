import { Component } from '@angular/core';
import { PostAttachmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Post Attachments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-postattachment-form',
    templateUrl: './postattachment.form.component.html'
})
export class PostAttachmentFormComponent extends BaseFormComponent {
    public record!: PostAttachmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'uploadMetadata', sectionName: 'Upload Metadata', isExpanded: false },
            { sectionKey: 'fileInformation', sectionName: 'File Information', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadPostAttachmentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
