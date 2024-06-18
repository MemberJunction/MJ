import { Component } from '@angular/core';
import { RecommendationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRecommendationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Recommendations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendation-form',
    templateUrl: './recommendation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecommendationFormComponent extends BaseFormComponent {
    public record!: RecommendationEntity;
} 

export function LoadRecommendationFormComponent() {
    LoadRecommendationDetailsComponent();
}
