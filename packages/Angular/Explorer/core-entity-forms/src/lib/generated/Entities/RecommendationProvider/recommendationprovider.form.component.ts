import { Component } from '@angular/core';
import { RecommendationProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Recommendation Providers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendationprovider-form',
    templateUrl: './recommendationprovider.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecommendationProviderFormComponent extends BaseFormComponent {
    public record!: RecommendationProviderEntity;

    // Collapsible section state
    public sectionsExpanded = {
        providerInformation: true,
        systemMetadata: false,
        recommendationRuns: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadRecommendationProviderFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
