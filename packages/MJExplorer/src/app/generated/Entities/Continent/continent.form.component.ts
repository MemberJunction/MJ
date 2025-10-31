import { Component } from '@angular/core';
import { ContinentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContinentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Continents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-continent-form',
    templateUrl: './continent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContinentFormComponent extends BaseFormComponent {
    public record!: ContinentEntity;
} 

export function LoadContinentFormComponent() {
    LoadContinentDetailsComponent();
}
