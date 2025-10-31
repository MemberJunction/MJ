import { Component } from '@angular/core';
import { ExamQuestionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExamQuestionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Exam Questions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-examquestion-form',
    templateUrl: './examquestion.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExamQuestionFormComponent extends BaseFormComponent {
    public record!: ExamQuestionEntity;
} 

export function LoadExamQuestionFormComponent() {
    LoadExamQuestionDetailsComponent();
}
