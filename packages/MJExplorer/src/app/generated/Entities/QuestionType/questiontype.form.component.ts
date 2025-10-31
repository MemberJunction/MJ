import { Component } from '@angular/core';
import { QuestionTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Question Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-questiontype-form',
    templateUrl: './questiontype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionTypeFormComponent extends BaseFormComponent {
    public record!: QuestionTypeEntity;
} 

export function LoadQuestionTypeFormComponent() {
    LoadQuestionTypeDetailsComponent();
}
