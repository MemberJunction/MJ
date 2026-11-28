import { Component } from '@angular/core';
import { MJAIAgentLearningCycleProposalSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Learning Cycle Proposal Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentlearningcycleproposalsource-form',
    templateUrl: './mjaiagentlearningcycleproposalsource.form.component.html'
})
export class MJAIAgentLearningCycleProposalSourceFormComponent extends BaseFormComponent {
    public record!: MJAIAgentLearningCycleProposalSourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'proposalAndEvidenceDetails', sectionName: 'Proposal and Evidence Details', isExpanded: true },
            { sectionKey: 'sourceReferences', sectionName: 'Source References', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

