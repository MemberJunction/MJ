import { Component } from '@angular/core';
import { AbstractEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAbstractDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Abstracts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-abstract-form',
    templateUrl: './abstract.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AbstractFormComponent extends BaseFormComponent {
    public record!: AbstractEntity;
} 

export function LoadAbstractFormComponent() {
    LoadAbstractDetailsComponent();
}
