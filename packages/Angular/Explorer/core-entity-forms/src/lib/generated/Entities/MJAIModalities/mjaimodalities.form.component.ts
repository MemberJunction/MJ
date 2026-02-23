import { Component } from '@angular/core';
import { MJAIModalitiesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Modalities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodalities-form',
    templateUrl: './mjaimodalities.form.component.html'
})
export class MJAIModalitiesFormComponent extends BaseFormComponent {
    public record!: MJAIModalitiesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modalityDefinition', sectionName: 'Modality Definition', isExpanded: true },
            { sectionKey: 'technicalConstraints', sectionName: 'Technical Constraints', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentModalities', sectionName: 'MJ: AI Agent Modalities', isExpanded: false },
            { sectionKey: 'mJAIModelModalities', sectionName: 'MJ: AI Model Modalities', isExpanded: false },
            { sectionKey: 'aIModelTypes', sectionName: 'AI Model Types', isExpanded: false },
            { sectionKey: 'mJAIPromptRunMedias', sectionName: 'MJ: AI Prompt Run Medias', isExpanded: false },
            { sectionKey: 'mJConversationDetailAttachments', sectionName: 'MJ: Conversation Detail Attachments', isExpanded: false },
            { sectionKey: 'mJAIAgentRunMedias', sectionName: 'MJ: AI Agent Run Medias', isExpanded: false },
            { sectionKey: 'aIModelTypes1', sectionName: 'AI Model Types', isExpanded: false }
        ]);
    }
}

