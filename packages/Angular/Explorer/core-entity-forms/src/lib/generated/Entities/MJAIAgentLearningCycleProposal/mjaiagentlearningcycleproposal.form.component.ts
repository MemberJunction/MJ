import { Component } from '@angular/core';
import { MJAIAgentLearningCycleProposalEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Learning Cycle Proposals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentlearningcycleproposal-form',
    templateUrl: './mjaiagentlearningcycleproposal.form.component.html'
})
export class MJAIAgentLearningCycleProposalFormComponent extends BaseFormComponent {
    public record!: MJAIAgentLearningCycleProposalEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'proposalIdentificationAndScope', sectionName: 'Proposal Identification and Scope', isExpanded: true },
            { sectionKey: 'verificationAndTesting', sectionName: 'Verification and Testing', isExpanded: true },
            { sectionKey: 'promotionAndReview', sectionName: 'Promotion and Review', isExpanded: true },
            { sectionKey: 'materializationAndApplication', sectionName: 'Materialization and Application', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAISkills', sectionName: 'AI Skills', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycleProposalSources', sectionName: 'AI Agent Learning Cycle Proposal Sources', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycleProposals', sectionName: 'AI Agent Learning Cycle Proposals', isExpanded: false }
        ]);
    }
}

