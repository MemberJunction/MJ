import { Component } from '@angular/core';
import { RecommendationItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Recommendation Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendationitem-form',
    templateUrl: './recommendationitem.form.component.html'
})
export class RecommendationItemFormComponent extends BaseFormComponent {
    public record!: RecommendationItemEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalIdentifiers', sectionName: 'Technical Identifiers', isExpanded: true },
            { sectionKey: 'recommendationData', sectionName: 'Recommendation Data', isExpanded: true },
            { sectionKey: 'recommendationDetails', sectionName: 'Recommendation Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadRecommendationItemFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
