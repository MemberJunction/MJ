import { Component } from '@angular/core';
import { FreightMethodsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFreightMethodsDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Freight Methods') // Tell MemberJunction about this class
@Component({
    selector: 'gen-freightmethods-form',
    templateUrl: './freightmethods.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FreightMethodsFormComponent extends BaseFormComponent {
    public record!: FreightMethodsEntity;
} 

export function LoadFreightMethodsFormComponent() {
    LoadFreightMethodsDetailsComponent();
}
