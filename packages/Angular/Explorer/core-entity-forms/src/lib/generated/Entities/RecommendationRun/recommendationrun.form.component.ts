import { Component } from '@angular/core';
import { RecommendationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Recommendation Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendationrun-form',
    templateUrl: './recommendationrun.form.component.html'
})
export class RecommendationRunFormComponent extends BaseFormComponent {
    public record!: RecommendationRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runIdentification', sectionName: 'Run Identification', isExpanded: true },
            { sectionKey: 'runScheduleStatus', sectionName: 'Run Schedule & Status', isExpanded: true },
            { sectionKey: 'runDescription', sectionName: 'Run Description', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'recommendations', sectionName: 'Recommendations', isExpanded: false }
        ]);
    }
}

export function LoadRecommendationRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
