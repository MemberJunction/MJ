import { Component } from '@angular/core';
import { StaffEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Staffs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-staff-form',
    templateUrl: './staff.form.component.html'
})
export class StaffFormComponent extends BaseFormComponent {
    public record!: StaffEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'customerOrders', sectionName: 'Customer Orders', isExpanded: false }
        ]);
    }
}

