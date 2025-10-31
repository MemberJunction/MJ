import { Component } from '@angular/core';
import { PersonFunctionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonFunctionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Functions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personfunction-form',
    templateUrl: './personfunction.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonFunctionFormComponent extends BaseFormComponent {
    public record!: PersonFunctionEntity;
} 

export function LoadPersonFunctionFormComponent() {
    LoadPersonFunctionDetailsComponent();
}
