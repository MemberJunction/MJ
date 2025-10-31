import { Component } from '@angular/core';
import { QuestionTreeKnowledgeStyleSheetEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionTreeKnowledgeStyleSheetDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Question Tree Knowledge Style Sheets') // Tell MemberJunction about this class
@Component({
    selector: 'gen-questiontreeknowledgestylesheet-form',
    templateUrl: './questiontreeknowledgestylesheet.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionTreeKnowledgeStyleSheetFormComponent extends BaseFormComponent {
    public record!: QuestionTreeKnowledgeStyleSheetEntity;
} 

export function LoadQuestionTreeKnowledgeStyleSheetFormComponent() {
    LoadQuestionTreeKnowledgeStyleSheetDetailsComponent();
}
