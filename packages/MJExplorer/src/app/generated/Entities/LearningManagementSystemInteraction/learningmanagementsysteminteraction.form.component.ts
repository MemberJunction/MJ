import { Component } from '@angular/core';
import { LearningManagementSystemInteractionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadLearningManagementSystemInteractionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Learning Management System Interactions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-learningmanagementsysteminteraction-form',
    templateUrl: './learningmanagementsysteminteraction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class LearningManagementSystemInteractionFormComponent extends BaseFormComponent {
    public record!: LearningManagementSystemInteractionEntity;
} 

export function LoadLearningManagementSystemInteractionFormComponent() {
    LoadLearningManagementSystemInteractionDetailsComponent();
}
