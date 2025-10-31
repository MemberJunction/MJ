import { Component } from '@angular/core';
import { AnswerSheetEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAnswerSheetDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Answer Sheets') // Tell MemberJunction about this class
@Component({
    selector: 'gen-answersheet-form',
    templateUrl: './answersheet.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AnswerSheetFormComponent extends BaseFormComponent {
    public record!: AnswerSheetEntity;
} 

export function LoadAnswerSheetFormComponent() {
    LoadAnswerSheetDetailsComponent();
}
