import { Component } from '@angular/core';
import { RecommendationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Recommendation Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendationrun-form',
    templateUrl: './recommendationrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecommendationRunFormComponent extends BaseFormComponent {
    public record!: RecommendationRunEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        recommendations: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadRecommendationRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
