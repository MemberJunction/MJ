import { Component } from '@angular/core';
import { LearningManagementSystemAttributeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadLearningManagementSystemAttributeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Learning Management System Attributes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-learningmanagementsystemattribute-form',
    templateUrl: './learningmanagementsystemattribute.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class LearningManagementSystemAttributeFormComponent extends BaseFormComponent {
    public record!: LearningManagementSystemAttributeEntity;
} 

export function LoadLearningManagementSystemAttributeFormComponent() {
    LoadLearningManagementSystemAttributeDetailsComponent();
}
