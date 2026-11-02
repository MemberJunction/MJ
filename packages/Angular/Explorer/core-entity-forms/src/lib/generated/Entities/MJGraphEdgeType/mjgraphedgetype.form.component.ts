import { Component } from '@angular/core';
import { MJGraphEdgeTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Graph Edge Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphedgetype-form',
    templateUrl: './mjgraphedgetype.form.component.html'
})
export class MJGraphEdgeTypeFormComponent extends BaseFormComponent {
    public record!: MJGraphEdgeTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'graphDefinition', sectionName: 'Graph Definition', isExpanded: true },
            { sectionKey: 'relationshipProperties', sectionName: 'Relationship Properties', isExpanded: true },
            { sectionKey: 'behaviorAndWeights', sectionName: 'Behavior and Weights', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJGraphEdges', sectionName: 'Graph Edges', isExpanded: false },
            { sectionKey: 'mJGraphEdgeTypeEndpoints', sectionName: 'Graph Edge Type Endpoints', isExpanded: false }
        ]);
    }
}

