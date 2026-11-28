import { Component } from '@angular/core';
import { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentnote-form',
    templateUrl: './mjaiagentnote.form.component.html'
})
export class MJAIAgentNoteFormComponent extends BaseFormComponent {
    public record!: MJAIAgentNoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeReferences', sectionName: 'Scope & References', isExpanded: true },
            { sectionKey: 'noteDetails', sectionName: 'Note Details', isExpanded: true },
            { sectionKey: 'embeddingAIData', sectionName: 'Embedding & AI Data', isExpanded: true },
            { sectionKey: 'usageLifecycle', sectionName: 'Usage & Lifecycle', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIAgentContextItems', sectionName: 'AI Agent Context Items', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycleProposalSources', sectionName: 'AI Agent Learning Cycle Proposal Sources', isExpanded: false },
            { sectionKey: 'mJAIAgentNoteSourcesNoteID', sectionName: 'AI Agent Note Sources (Note)', isExpanded: false },
            { sectionKey: 'mJAIAgentNoteSourcesSourceNoteID', sectionName: 'AI Agent Note Sources (Source Note)', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycleProposals', sectionName: 'AI Agent Learning Cycle Proposals', isExpanded: false }
        ]);
    }
}

