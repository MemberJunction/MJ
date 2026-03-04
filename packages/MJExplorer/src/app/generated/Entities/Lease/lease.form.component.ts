import { Component } from '@angular/core';
import { LeaseEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Leases') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-lease-form',
    templateUrl: './lease.form.component.html'
})
export class LeaseFormComponent extends BaseFormComponent {
    public record!: LeaseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'paymentssampleProperty', sectionName: 'Payments__sample_property', isExpanded: false }
        ]);
    }
}

