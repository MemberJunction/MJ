import { Component } from '@angular/core';
import { PersonAccountManagerEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonAccountManagerDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Account Managers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personaccountmanager-form',
    templateUrl: './personaccountmanager.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonAccountManagerFormComponent extends BaseFormComponent {
    public record!: PersonAccountManagerEntity;
} 

export function LoadPersonAccountManagerFormComponent() {
    LoadPersonAccountManagerDetailsComponent();
}
