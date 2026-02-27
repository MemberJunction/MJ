import { Component } from '@angular/core';
import { MJAIModalityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Modalities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodality-form',
    templateUrl: './mjaimodality.form.component.html'
})
export class MJAIModalityFormComponent extends BaseFormComponent {
    public record!: MJAIModalityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modalityDefinition', sectionName: 'Modality Definition', isExpanded: true },
            { sectionKey: 'technicalConstraints', sectionName: 'Technical Constraints', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentModalities', sectionName: 'AI Agent Modalities', isExpanded: false },
            { sectionKey: 'mJAIModelModalities', sectionName: 'AI Model Modalities', isExpanded: false },
            { sectionKey: 'mJAIModelTypesDefaultOutputModalityID', sectionName: 'AI Model Types', isExpanded: false },
            { sectionKey: 'mJAIPromptRunMedias', sectionName: 'AI Prompt Run Medias', isExpanded: false },
            { sectionKey: 'mJConversationDetailAttachments', sectionName: 'Conversation Detail Attachments', isExpanded: false },
            { sectionKey: 'mJAIAgentRunMedias', sectionName: 'AI Agent Run Medias', isExpanded: false },
            { sectionKey: 'mJAIModelTypesDefaultInputModalityID', sectionName: 'AI Model Types', isExpanded: false }
        ]);
    }
}

