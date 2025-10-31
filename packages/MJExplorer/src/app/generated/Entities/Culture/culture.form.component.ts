import { Component } from '@angular/core';
import { CultureEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCultureDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Cultures') // Tell MemberJunction about this class
@Component({
    selector: 'gen-culture-form',
    templateUrl: './culture.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CultureFormComponent extends BaseFormComponent {
    public record!: CultureEntity;
} 

export function LoadCultureFormComponent() {
    LoadCultureDetailsComponent();
}
