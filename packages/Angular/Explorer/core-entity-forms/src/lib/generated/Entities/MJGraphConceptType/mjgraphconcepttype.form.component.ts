import { Component } from '@angular/core';
import { MJGraphConceptTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Graph Concept Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphconcepttype-form',
    templateUrl: './mjgraphconcepttype.form.component.html'
})
export class MJGraphConceptTypeFormComponent extends BaseFormComponent {
    public record!: MJGraphConceptTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'conceptTypeDetails', sectionName: 'Concept Type Details', isExpanded: true },
            { sectionKey: 'configurationAndDisplay', sectionName: 'Configuration and Display', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJGraphConcepts', sectionName: 'Graph Concepts', isExpanded: false }
        ]);
    }
}

