import { Component } from '@angular/core';
import { LearningManagementSystemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadLearningManagementSystemDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Learning Management Systems') // Tell MemberJunction about this class
@Component({
    selector: 'gen-learningmanagementsystem-form',
    templateUrl: './learningmanagementsystem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class LearningManagementSystemFormComponent extends BaseFormComponent {
    public record!: LearningManagementSystemEntity;
} 

export function LoadLearningManagementSystemFormComponent() {
    LoadLearningManagementSystemDetailsComponent();
}
