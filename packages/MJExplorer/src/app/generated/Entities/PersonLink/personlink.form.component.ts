import { Component } from '@angular/core';
import { PersonLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonLinkDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Person Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personlink-form',
    templateUrl: './personlink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonLinkFormComponent extends BaseFormComponent {
    public record!: PersonLinkEntity;
} 

export function LoadPersonLinkFormComponent() {
    LoadPersonLinkDetailsComponent();
}
