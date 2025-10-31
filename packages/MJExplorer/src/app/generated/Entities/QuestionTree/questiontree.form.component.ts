import { Component } from '@angular/core';
import { QuestionTreeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionTreeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Question Trees') // Tell MemberJunction about this class
@Component({
    selector: 'gen-questiontree-form',
    templateUrl: './questiontree.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionTreeFormComponent extends BaseFormComponent {
    public record!: QuestionTreeEntity;
} 

export function LoadQuestionTreeFormComponent() {
    LoadQuestionTreeDetailsComponent();
}
