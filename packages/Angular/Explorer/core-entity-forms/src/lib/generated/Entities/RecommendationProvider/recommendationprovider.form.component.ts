import { Component } from '@angular/core';
import { RecommendationProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRecommendationProviderDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Recommendation Providers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendationprovider-form',
    templateUrl: './recommendationprovider.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecommendationProviderFormComponent extends BaseFormComponent {
    public record!: RecommendationProviderEntity;
} 

export function LoadRecommendationProviderFormComponent() {
    LoadRecommendationProviderDetailsComponent();
}
