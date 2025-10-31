import { Component } from '@angular/core';
import { ClassExpectedStudentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassExpectedStudentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Class Expected Students') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classexpectedstudent-form',
    templateUrl: './classexpectedstudent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassExpectedStudentFormComponent extends BaseFormComponent {
    public record!: ClassExpectedStudentEntity;
} 

export function LoadClassExpectedStudentFormComponent() {
    LoadClassExpectedStudentDetailsComponent();
}
