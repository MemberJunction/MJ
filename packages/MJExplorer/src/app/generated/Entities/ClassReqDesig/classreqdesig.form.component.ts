import { Component } from '@angular/core';
import { ClassReqDesigEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassReqDesigDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Class Req Desigs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classreqdesig-form',
    templateUrl: './classreqdesig.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassReqDesigFormComponent extends BaseFormComponent {
    public record!: ClassReqDesigEntity;
} 

export function LoadClassReqDesigFormComponent() {
    LoadClassReqDesigDetailsComponent();
}
