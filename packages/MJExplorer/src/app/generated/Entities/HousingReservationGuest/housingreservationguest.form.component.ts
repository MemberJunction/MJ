import { Component } from '@angular/core';
import { HousingReservationGuestEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingReservationGuestDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Housing Reservation Guests') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingreservationguest-form',
    templateUrl: './housingreservationguest.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingReservationGuestFormComponent extends BaseFormComponent {
    public record!: HousingReservationGuestEntity;
} 

export function LoadHousingReservationGuestFormComponent() {
    LoadHousingReservationGuestDetailsComponent();
}
