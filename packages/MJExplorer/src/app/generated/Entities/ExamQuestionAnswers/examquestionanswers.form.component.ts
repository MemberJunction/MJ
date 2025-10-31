import { Component } from '@angular/core';
import { ExamQuestionAnswersEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExamQuestionAnswersDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Exam Question Answers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-examquestionanswers-form',
    templateUrl: './examquestionanswers.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExamQuestionAnswersFormComponent extends BaseFormComponent {
    public record!: ExamQuestionAnswersEntity;
} 

export function LoadExamQuestionAnswersFormComponent() {
    LoadExamQuestionAnswersDetailsComponent();
}
