import { Component } from '@angular/core';
import { EducationLevelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEducationLevelDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Education Levels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-educationlevel-form',
    templateUrl: './educationlevel.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EducationLevelFormComponent extends BaseFormComponent {
    public record!: EducationLevelEntity;
} 

export function LoadEducationLevelFormComponent() {
    LoadEducationLevelDetailsComponent();
}
