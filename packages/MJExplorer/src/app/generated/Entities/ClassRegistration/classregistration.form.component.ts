import { Component } from '@angular/core';
import { ClassRegistrationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassRegistrationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Class Registrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classregistration-form',
    templateUrl: './classregistration.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassRegistrationFormComponent extends BaseFormComponent {
    public record!: ClassRegistrationEntity;
} 

export function LoadClassRegistrationFormComponent() {
    LoadClassRegistrationDetailsComponent();
}
