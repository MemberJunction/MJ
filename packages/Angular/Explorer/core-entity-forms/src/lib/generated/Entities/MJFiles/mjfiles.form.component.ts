import { Component } from '@angular/core';
import { MJFilesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Files') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfiles-form',
    templateUrl: './mjfiles.form.component.html'
})
export class MJFilesFormComponent extends BaseFormComponent {
    public record!: MJFilesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'fileBasics', sectionName: 'File Basics', isExpanded: true },
            { sectionKey: 'classificationStatus', sectionName: 'Classification & Status', isExpanded: true },
            { sectionKey: 'storageDetails', sectionName: 'Storage Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'fileEntityRecordLinks', sectionName: 'File Entity Record Links', isExpanded: false },
            { sectionKey: 'mJAIPromptRunMedias', sectionName: 'MJ: AI Prompt Run Medias', isExpanded: false },
            { sectionKey: 'mJConversationDetailAttachments', sectionName: 'MJ: Conversation Detail Attachments', isExpanded: false },
            { sectionKey: 'mJAIAgentRunMedias', sectionName: 'MJ: AI Agent Run Medias', isExpanded: false }
        ]);
    }
}

