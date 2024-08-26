import { Component } from '@angular/core';
import { AnothaTablaEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAnothaTablaDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Anotha Tablas') // Tell MemberJunction about this class
@Component({
    selector: 'gen-anothatabla-form',
    templateUrl: './anothatabla.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AnothaTablaFormComponent extends BaseFormComponent {
    public record!: AnothaTablaEntity;
} 

export function LoadAnothaTablaFormComponent() {
    LoadAnothaTablaDetailsComponent();
}
