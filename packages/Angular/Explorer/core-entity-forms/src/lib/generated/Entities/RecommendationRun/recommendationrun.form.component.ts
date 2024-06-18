import { Component } from '@angular/core';
import { RecommendationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRecommendationRunDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Recommendation Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendationrun-form',
    templateUrl: './recommendationrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecommendationRunFormComponent extends BaseFormComponent {
    public record!: RecommendationRunEntity;
} 

export function LoadRecommendationRunFormComponent() {
    LoadRecommendationRunDetailsComponent();
}
