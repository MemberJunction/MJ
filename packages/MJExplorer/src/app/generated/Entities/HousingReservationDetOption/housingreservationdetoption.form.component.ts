import { Component } from '@angular/core';
import { HousingReservationDetOptionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingReservationDetOptionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Housing Reservation Det Options') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingreservationdetoption-form',
    templateUrl: './housingreservationdetoption.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingReservationDetOptionFormComponent extends BaseFormComponent {
    public record!: HousingReservationDetOptionEntity;
} 

export function LoadHousingReservationDetOptionFormComponent() {
    LoadHousingReservationDetOptionDetailsComponent();
}
