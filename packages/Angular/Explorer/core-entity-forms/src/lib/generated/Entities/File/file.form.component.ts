import { Component } from '@angular/core';
import { FileEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Files') // Tell MemberJunction about this class
@Component({
    selector: 'gen-file-form',
    templateUrl: './file.form.component.html'
})
export class FileFormComponent extends BaseFormComponent {
    public record!: FileEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'fileBasics', sectionName: 'File Basics', isExpanded: true },
            { sectionKey: 'classificationStatus', sectionName: 'Classification & Status', isExpanded: true },
            { sectionKey: 'storageDetails', sectionName: 'Storage Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'fileEntityRecordLinks', sectionName: 'File Entity Record Links', isExpanded: false },
            { sectionKey: 'mJConversationDetailAttachments', sectionName: 'MJ: Conversation Detail Attachments', isExpanded: false }
        ]);
    }
}

export function LoadFileFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
