import { Component } from '@angular/core';
import { MJGraphEdgeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

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
            { sectionKey: 'edgeRelationships', sectionName: 'Edge Relationships', isExpanded: true },
            { sectionKey: 'edgeProperties', sectionName: 'Edge Properties', isExpanded: true },
            { sectionKey: 'governanceAndScoring', sectionName: 'Governance and Scoring', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

