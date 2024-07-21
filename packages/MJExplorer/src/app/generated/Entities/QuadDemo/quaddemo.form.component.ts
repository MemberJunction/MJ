import { Component } from '@angular/core';
import { QuadDemoEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQuadDemoDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Quad Demos') // Tell MemberJunction about this class
@Component({
    selector: 'gen-quaddemo-form',
    templateUrl: './quaddemo.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QuadDemoFormComponent extends BaseFormComponent {
    public record!: QuadDemoEntity;
} 

export function LoadQuadDemoFormComponent() {
    LoadQuadDemoDetailsComponent();
}
