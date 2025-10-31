import { Component } from '@angular/core';
import { ClassRegistrationPartStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassRegistrationPartStatusDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Class Registration Part Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classregistrationpartstatus-form',
    templateUrl: './classregistrationpartstatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassRegistrationPartStatusFormComponent extends BaseFormComponent {
    public record!: ClassRegistrationPartStatusEntity;
} 

export function LoadClassRegistrationPartStatusFormComponent() {
    LoadClassRegistrationPartStatusDetailsComponent();
}
