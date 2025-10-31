import { Component } from '@angular/core';
import { QuestionBranchAnswerBranchEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionBranchAnswerBranchDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Question Branch Answer Branches') // Tell MemberJunction about this class
@Component({
    selector: 'gen-questionbranchanswerbranch-form',
    templateUrl: './questionbranchanswerbranch.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionBranchAnswerBranchFormComponent extends BaseFormComponent {
    public record!: QuestionBranchAnswerBranchEntity;
} 

export function LoadQuestionBranchAnswerBranchFormComponent() {
    LoadQuestionBranchAnswerBranchDetailsComponent();
}
