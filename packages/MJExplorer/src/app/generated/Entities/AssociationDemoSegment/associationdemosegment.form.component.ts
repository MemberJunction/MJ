import { Component } from '@angular/core';
import { AssociationDemoSegmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Segments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemosegment-form',
    templateUrl: './associationdemosegment.form.component.html'
})
export class AssociationDemoSegmentFormComponent extends BaseFormComponent {
    public record!: AssociationDemoSegmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'segmentDefinition', sectionName: 'Segment Definition', isExpanded: true },
            { sectionKey: 'segmentLogic', sectionName: 'Segment Logic', isExpanded: true },
            { sectionKey: 'segmentPerformance', sectionName: 'Segment Performance', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'campaignMembers', sectionName: 'Campaign Members', isExpanded: false }
        ]);
    }
}

