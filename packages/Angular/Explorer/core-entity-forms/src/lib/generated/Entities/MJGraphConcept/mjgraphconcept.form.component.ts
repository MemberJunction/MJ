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
            { sectionKey: 'conceptRelationships', sectionName: 'Concept Relationships', isExpanded: true },
            { sectionKey: 'conceptDefinition', sectionName: 'Concept Definition', isExpanded: true },
            { sectionKey: 'governanceAndRules', sectionName: 'Governance and Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJGraphConcepts', sectionName: 'Graph Concepts', isExpanded: false }
        ]);
    }
}

