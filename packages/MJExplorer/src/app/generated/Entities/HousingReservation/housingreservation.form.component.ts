import { Component } from '@angular/core';
import { HousingReservationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingReservationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Housing Reservations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingreservation-form',
    templateUrl: './housingreservation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingReservationFormComponent extends BaseFormComponent {
    public record!: HousingReservationEntity;
} 

export function LoadHousingReservationFormComponent() {
    LoadHousingReservationDetailsComponent();
}
