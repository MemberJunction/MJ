import { Component } from '@angular/core';
import { PersonEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonOtherComponent } from "./sections/other.component"
import { LoadPersonTopComponent } from "./sections/top.component"
import { LoadPersonDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Persons') // Tell MemberJunction about this class
@Component({
    selector: 'gen-person-form',
    templateUrl: './person.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonFormComponent extends BaseFormComponent {
    public record!: PersonEntity;
} 

export function LoadPersonFormComponent() {
    LoadPersonOtherComponent();
    LoadPersonTopComponent();
    LoadPersonDetailsComponent();
}
