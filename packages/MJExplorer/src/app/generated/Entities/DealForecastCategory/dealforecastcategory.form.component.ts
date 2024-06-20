import { Component } from '@angular/core';
import { DealForecastCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDealForecastCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Deal Forecast Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dealforecastcategory-form',
    templateUrl: './dealforecastcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DealForecastCategoryFormComponent extends BaseFormComponent {
    public record!: DealForecastCategoryEntity;
} 

export function LoadDealForecastCategoryFormComponent() {
    LoadDealForecastCategoryDetailsComponent();
}
