import { Component } from '@angular/core';
import { StateProvinceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadStateProvinceDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'State Provinces') // Tell MemberJunction about this class
@Component({
    selector: 'gen-stateprovince-form',
    templateUrl: './stateprovince.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class StateProvinceFormComponent extends BaseFormComponent {
    public record!: StateProvinceEntity;
} 

export function LoadStateProvinceFormComponent() {
    LoadStateProvinceDetailsComponent();
}
