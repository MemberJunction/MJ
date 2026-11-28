import { Component } from '@angular/core';
import { MJGraphEdgeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Graph Edges') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphedge-form',
    templateUrl: './mjgraphedge.form.component.html'
})
export class MJGraphEdgeFormComponent extends BaseFormComponent {
    public record!: MJGraphEdgeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'graphRelationships', sectionName: 'Graph Relationships', isExpanded: true },
            { sectionKey: 'sourceAndTargetNodes', sectionName: 'Source and Target Nodes', isExpanded: true },
            { sectionKey: 'edgeProperties', sectionName: 'Edge Properties', isExpanded: true },
            { sectionKey: 'governanceAndOrigin', sectionName: 'Governance and Origin', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycleProposalSources', sectionName: 'AI Agent Learning Cycle Proposal Sources', isExpanded: false },
            { sectionKey: 'mJAIAgentLearningCycleProposals', sectionName: 'AI Agent Learning Cycle Proposals', isExpanded: false }
        ]);
    }
}

