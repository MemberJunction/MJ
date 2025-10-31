import { Component } from '@angular/core';
import { ClassEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Classes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-class-form',
    templateUrl: './class.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassFormComponent extends BaseFormComponent {
    public record!: ClassEntity;
} 

export function LoadClassFormComponent() {
    LoadClassDetailsComponent();
}
