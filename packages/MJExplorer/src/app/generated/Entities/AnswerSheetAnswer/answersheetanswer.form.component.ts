import { Component } from '@angular/core';
import { AnswerSheetAnswerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAnswerSheetAnswerDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Answer Sheet Answers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-answersheetanswer-form',
    templateUrl: './answersheetanswer.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AnswerSheetAnswerFormComponent extends BaseFormComponent {
    public record!: AnswerSheetAnswerEntity;
} 

export function LoadAnswerSheetAnswerFormComponent() {
    LoadAnswerSheetAnswerDetailsComponent();
}
