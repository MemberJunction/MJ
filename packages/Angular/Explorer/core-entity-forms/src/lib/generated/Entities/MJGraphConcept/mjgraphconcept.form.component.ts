import { Component } from '@angular/core';
import { MJGraphConceptEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Graph Concepts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphconcept-form',
    templateUrl: './mjgraphconcept.form.component.html'
})
export class MJGraphConceptFormComponent extends BaseFormComponent {
    public record!: MJGraphConceptEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'conceptDetails', sectionName: 'Concept Details', isExpanded: true },
            { sectionKey: 'contentAndSpecification', sectionName: 'Content and Specification', isExpanded: true },
            { sectionKey: 'governanceAndLifecycle', sectionName: 'Governance and Lifecycle', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJGraphConcepts', sectionName: 'Graph Concepts', isExpanded: false },
            { sectionKey: 'mJAIAgentContextItems', sectionName: 'AI Agent Context Items', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycleProposalSources', sectionName: 'AI Agent Learning Cycle Proposal Sources', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycleProposals', sectionName: 'AI Agent Learning Cycle Proposals', isExpanded: false }
        ]);
    }
}

