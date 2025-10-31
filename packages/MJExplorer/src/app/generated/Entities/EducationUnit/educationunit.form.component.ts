import { Component } from '@angular/core';
import { EducationUnitEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEducationUnitDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Education Units') // Tell MemberJunction about this class
@Component({
    selector: 'gen-educationunit-form',
    templateUrl: './educationunit.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EducationUnitFormComponent extends BaseFormComponent {
    public record!: EducationUnitEntity;
} 

export function LoadEducationUnitFormComponent() {
    LoadEducationUnitDetailsComponent();
}
