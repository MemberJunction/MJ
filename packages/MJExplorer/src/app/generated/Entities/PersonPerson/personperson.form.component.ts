import { Component } from '@angular/core';
import { PersonPersonEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonPersonDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Person Persons') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personperson-form',
    templateUrl: './personperson.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonPersonFormComponent extends BaseFormComponent {
    public record!: PersonPersonEntity;
} 

export function LoadPersonPersonFormComponent() {
    LoadPersonPersonDetailsComponent();
}
