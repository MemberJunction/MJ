import { Component } from '@angular/core';
import { SegmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Segments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-segment-form',
    templateUrl: './segment.form.component.html'
})
export class SegmentFormComponent extends BaseFormComponent {
    public record!: SegmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'segmentDefinition', sectionName: 'Segment Definition', isExpanded: true },
            { sectionKey: 'metricsStatus', sectionName: 'Metrics & Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'campaignMembers', sectionName: 'Campaign Members', isExpanded: false }
        ]);
    }
}

export function LoadSegmentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
