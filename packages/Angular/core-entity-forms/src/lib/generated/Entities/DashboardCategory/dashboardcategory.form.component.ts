import { Component } from '@angular/core';
import { DashboardCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDashboardCategoryDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Dashboard Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboardcategory-form',
    templateUrl: './dashboardcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DashboardCategoryFormComponent extends BaseFormComponent {
    public record!: DashboardCategoryEntity;
} 

export function LoadDashboardCategoryFormComponent() {
    LoadDashboardCategoryDetailsComponent();
}
