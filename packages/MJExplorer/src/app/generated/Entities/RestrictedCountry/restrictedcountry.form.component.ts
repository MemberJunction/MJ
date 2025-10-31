import { Component } from '@angular/core';
import { RestrictedCountryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadRestrictedCountryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Restricted Countries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-restrictedcountry-form',
    templateUrl: './restrictedcountry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RestrictedCountryFormComponent extends BaseFormComponent {
    public record!: RestrictedCountryEntity;
} 

export function LoadRestrictedCountryFormComponent() {
    LoadRestrictedCountryDetailsComponent();
}
