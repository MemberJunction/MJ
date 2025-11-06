import { Component } from '@angular/core';
import { RecommendationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Recommendations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendation-form',
    templateUrl: './recommendation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecommendationFormComponent extends BaseFormComponent {
    public record!: RecommendationEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        recommendationItems: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadRecommendationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
