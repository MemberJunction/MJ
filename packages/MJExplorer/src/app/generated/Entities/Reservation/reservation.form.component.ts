import { Component } from '@angular/core';
import { ReservationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Reservations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-reservation-form',
    templateUrl: './reservation.form.component.html'
})
export class ReservationFormComponent extends BaseFormComponent {
    public record!: ReservationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

