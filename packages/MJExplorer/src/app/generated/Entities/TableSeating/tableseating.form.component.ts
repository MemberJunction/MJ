import { Component } from '@angular/core';
import { TableSeatingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Table Seatings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-tableseating-form',
    templateUrl: './tableseating.form.component.html'
})
export class TableSeatingFormComponent extends BaseFormComponent {
    public record!: TableSeatingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'reservations', sectionName: 'Reservations', isExpanded: false },
            { sectionKey: 'customerOrders', sectionName: 'Customer Orders', isExpanded: false }
        ]);
    }
}

