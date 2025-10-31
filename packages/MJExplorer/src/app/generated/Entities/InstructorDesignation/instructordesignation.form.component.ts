import { Component } from '@angular/core';
import { InstructorDesignationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInstructorDesignationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Instructor Designations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-instructordesignation-form',
    templateUrl: './instructordesignation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InstructorDesignationFormComponent extends BaseFormComponent {
    public record!: InstructorDesignationEntity;
} 

export function LoadInstructorDesignationFormComponent() {
    LoadInstructorDesignationDetailsComponent();
}
