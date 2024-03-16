import { Component } from '@angular/core';
import { AnotherTestEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadAnotherTestDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Another Tests') // Tell MemberJunction about this class
@Component({
    selector: 'gen-anothertest-form',
    templateUrl: './anothertest.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AnotherTestFormComponent extends BaseFormComponent {
    public record!: AnotherTestEntity;
} 

export function LoadAnotherTestFormComponent() {
    LoadAnotherTestDetailsComponent();
}
