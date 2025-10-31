import { Component } from '@angular/core';
import { FoodPreferenceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFoodPreferenceDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Food Preferences') // Tell MemberJunction about this class
@Component({
    selector: 'gen-foodpreference-form',
    templateUrl: './foodpreference.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FoodPreferenceFormComponent extends BaseFormComponent {
    public record!: FoodPreferenceEntity;
} 

export function LoadFoodPreferenceFormComponent() {
    LoadFoodPreferenceDetailsComponent();
}
