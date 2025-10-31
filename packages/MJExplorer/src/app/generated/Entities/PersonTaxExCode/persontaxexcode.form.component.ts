import { Component } from '@angular/core';
import { PersonTaxExCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonTaxExCodeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Tax Ex Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-persontaxexcode-form',
    templateUrl: './persontaxexcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonTaxExCodeFormComponent extends BaseFormComponent {
    public record!: PersonTaxExCodeEntity;
} 

export function LoadPersonTaxExCodeFormComponent() {
    LoadPersonTaxExCodeDetailsComponent();
}
