import { Component } from '@angular/core';
import { QuestionBranchEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuestionBranchDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Question Branches') // Tell MemberJunction about this class
@Component({
    selector: 'gen-questionbranch-form',
    templateUrl: './questionbranch.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuestionBranchFormComponent extends BaseFormComponent {
    public record!: QuestionBranchEntity;
} 

export function LoadQuestionBranchFormComponent() {
    LoadQuestionBranchDetailsComponent();
}
