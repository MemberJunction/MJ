import { Component } from '@angular/core';
import { QuestionTreeListKnowledgeStyleSheetEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionTreeListKnowledgeStyleSheetDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Question Tree List Knowledge Style Sheets') // Tell MemberJunction about this class
@Component({
    selector: 'gen-questiontreelistknowledgestylesheet-form',
    templateUrl: './questiontreelistknowledgestylesheet.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionTreeListKnowledgeStyleSheetFormComponent extends BaseFormComponent {
    public record!: QuestionTreeListKnowledgeStyleSheetEntity;
} 

export function LoadQuestionTreeListKnowledgeStyleSheetFormComponent() {
    LoadQuestionTreeListKnowledgeStyleSheetDetailsComponent();
}
