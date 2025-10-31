import { Component } from '@angular/core';
import { ExamEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExamDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Exams') // Tell MemberJunction about this class
@Component({
    selector: 'gen-exam-form',
    templateUrl: './exam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExamFormComponent extends BaseFormComponent {
    public record!: ExamEntity;
} 

export function LoadExamFormComponent() {
    LoadExamDetailsComponent();
}
