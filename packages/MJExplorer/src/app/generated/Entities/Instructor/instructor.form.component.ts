import { Component } from '@angular/core';
import { InstructorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInstructorDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Instructors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-instructor-form',
    templateUrl: './instructor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InstructorFormComponent extends BaseFormComponent {
    public record!: InstructorEntity;
} 

export function LoadInstructorFormComponent() {
    LoadInstructorDetailsComponent();
}
