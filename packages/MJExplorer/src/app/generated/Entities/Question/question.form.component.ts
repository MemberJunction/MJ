import { Component } from '@angular/core';
import { QuestionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Questions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-question-form',
    templateUrl: './question.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionFormComponent extends BaseFormComponent {
    public record!: QuestionEntity;
} 

export function LoadQuestionFormComponent() {
    LoadQuestionDetailsComponent();
}
