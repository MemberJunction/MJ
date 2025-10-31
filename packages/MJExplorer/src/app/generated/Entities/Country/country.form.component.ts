import { Component } from '@angular/core';
import { CountryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCountryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Countries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-country-form',
    templateUrl: './country.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CountryFormComponent extends BaseFormComponent {
    public record!: CountryEntity;
} 

export function LoadCountryFormComponent() {
    LoadCountryDetailsComponent();
}
