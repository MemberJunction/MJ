import { Component } from '@angular/core';
import { RecommendationItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRecommendationItemDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Recommendation Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recommendationitem-form',
    templateUrl: './recommendationitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecommendationItemFormComponent extends BaseFormComponent {
    public record!: RecommendationItemEntity;
} 

export function LoadRecommendationItemFormComponent() {
    LoadRecommendationItemDetailsComponent();
}
