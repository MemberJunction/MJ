import { Component } from '@angular/core';
import { AIModalityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Modalities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aimodality-form',
    templateUrl: './aimodality.form.component.html'
})
export class AIModalityFormComponent extends BaseFormComponent {
    public record!: AIModalityEntity;

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
            { sectionKey: 'aIModelTypes1', sectionName: 'AI Model Types', isExpanded: false },
            { sectionKey: 'mJAIAgentRunMedias', sectionName: 'MJ: AI Agent Run Medias', isExpanded: false }
        ]);
    }
}

export function LoadAIModalityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
