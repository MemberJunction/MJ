import { Component } from '@angular/core';
import { EducationCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEducationCategoryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Education Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-educationcategory-form',
    templateUrl: './educationcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EducationCategoryFormComponent extends BaseFormComponent {
    public record!: EducationCategoryEntity;
} 

export function LoadEducationCategoryFormComponent() {
    LoadEducationCategoryDetailsComponent();
}
