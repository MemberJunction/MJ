import { Component } from '@angular/core';
import { UoMEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUoMDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Uo Ms') // Tell MemberJunction about this class
@Component({
    selector: 'gen-uom-form',
    templateUrl: './uom.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UoMFormComponent extends BaseFormComponent {
    public record!: UoMEntity;
} 

export function LoadUoMFormComponent() {
    LoadUoMDetailsComponent();
}
