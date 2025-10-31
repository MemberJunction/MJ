import { Component } from '@angular/core';
import { QuestionKnowledgeAnswerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionKnowledgeAnswerDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Question Knowledge Answers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-questionknowledgeanswer-form',
    templateUrl: './questionknowledgeanswer.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionKnowledgeAnswerFormComponent extends BaseFormComponent {
    public record!: QuestionKnowledgeAnswerEntity;
} 

export function LoadQuestionKnowledgeAnswerFormComponent() {
    LoadQuestionKnowledgeAnswerDetailsComponent();
}
