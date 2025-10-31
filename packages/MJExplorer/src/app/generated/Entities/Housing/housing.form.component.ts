import { Component } from '@angular/core';
import { HousingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Housings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housing-form',
    templateUrl: './housing.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingFormComponent extends BaseFormComponent {
    public record!: HousingEntity;
} 

export function LoadHousingFormComponent() {
    LoadHousingDetailsComponent();
}
