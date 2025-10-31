import { Component } from '@angular/core';
import { EnrollmentTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEnrollmentTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Enrollment Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-enrollmenttype-form',
    templateUrl: './enrollmenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EnrollmentTypeFormComponent extends BaseFormComponent {
    public record!: EnrollmentTypeEntity;
} 

export function LoadEnrollmentTypeFormComponent() {
    LoadEnrollmentTypeDetailsComponent();
}
