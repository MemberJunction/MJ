import { Component } from '@angular/core';
import { MJGraphEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Graphs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraph-form',
    templateUrl: './mjgraph.form.component.html'
})
export class MJGraphFormComponent extends BaseFormComponent {
    public record!: MJGraphEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'graphConfiguration', sectionName: 'Graph Configuration', isExpanded: true },
            { sectionKey: 'operationalSettings', sectionName: 'Operational Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJGraphEdges', sectionName: 'Graph Edges', isExpanded: false },
            { sectionKey: 'mJGraphEdgeProviders', sectionName: 'Graph Edge Providers', isExpanded: false },
            { sectionKey: 'mJGraphEdgeTypes', sectionName: 'Graph Edge Types', isExpanded: false },
            { sectionKey: 'mJContentSources', sectionName: 'Content Sources', isExpanded: false },
            { sectionKey: 'mJGraphConcepts', sectionName: 'Graph Concepts', isExpanded: false }
        ]);
    }
}

