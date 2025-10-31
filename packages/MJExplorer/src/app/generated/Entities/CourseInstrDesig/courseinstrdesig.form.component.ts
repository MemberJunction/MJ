import { Component } from '@angular/core';
import { CourseInstrDesigEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCourseInstrDesigDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Course Instr Desigs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-courseinstrdesig-form',
    templateUrl: './courseinstrdesig.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CourseInstrDesigFormComponent extends BaseFormComponent {
    public record!: CourseInstrDesigEntity;
} 

export function LoadCourseInstrDesigFormComponent() {
    LoadCourseInstrDesigDetailsComponent();
}
