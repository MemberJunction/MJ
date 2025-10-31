import { Component } from '@angular/core';
import { HousingReservationDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadHousingReservationDetailDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Housing Reservation Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-housingreservationdetail-form',
    templateUrl: './housingreservationdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class HousingReservationDetailFormComponent extends BaseFormComponent {
    public record!: HousingReservationDetailEntity;
} 

export function LoadHousingReservationDetailFormComponent() {
    LoadHousingReservationDetailDetailsComponent();
}
