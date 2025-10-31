import { Component } from '@angular/core';
import { ClassExamEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassExamDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Class Exams') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classexam-form',
    templateUrl: './classexam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassExamFormComponent extends BaseFormComponent {
    public record!: ClassExamEntity;
} 

export function LoadClassExamFormComponent() {
    LoadClassExamDetailsComponent();
}
