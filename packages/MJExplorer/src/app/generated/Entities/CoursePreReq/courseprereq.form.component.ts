import { Component } from '@angular/core';
import { CoursePreReqEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCoursePreReqDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Course Pre Reqs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-courseprereq-form',
    templateUrl: './courseprereq.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CoursePreReqFormComponent extends BaseFormComponent {
    public record!: CoursePreReqEntity;
} 

export function LoadCoursePreReqFormComponent() {
    LoadCoursePreReqDetailsComponent();
}
