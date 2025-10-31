import { Component } from '@angular/core';
import { MembershipEnrollmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMembershipEnrollmentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Membership Enrollments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membershipenrollment-form',
    templateUrl: './membershipenrollment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MembershipEnrollmentFormComponent extends BaseFormComponent {
    public record!: MembershipEnrollmentEntity;
} 

export function LoadMembershipEnrollmentFormComponent() {
    LoadMembershipEnrollmentDetailsComponent();
}
