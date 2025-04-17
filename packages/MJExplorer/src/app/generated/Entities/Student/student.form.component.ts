import { Component } from '@angular/core';
import { StudentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadStudentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Students') // Tell MemberJunction about this class
@Component({
    selector: 'gen-student-form',
    templateUrl: './student.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class StudentFormComponent extends BaseFormComponent {
    public record!: StudentEntity;
} 

export function LoadStudentFormComponent() {
    LoadStudentDetailsComponent();
}
