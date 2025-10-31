import { Component } from '@angular/core';
import { ClassPartUseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassPartUseDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Class Part Uses') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classpartuse-form',
    templateUrl: './classpartuse.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassPartUseFormComponent extends BaseFormComponent {
    public record!: ClassPartUseEntity;
} 

export function LoadClassPartUseFormComponent() {
    LoadClassPartUseDetailsComponent();
}
