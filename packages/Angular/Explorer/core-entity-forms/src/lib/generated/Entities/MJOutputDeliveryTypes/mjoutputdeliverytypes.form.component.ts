import { Component } from '@angular/core';
import { MJOutputDeliveryTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Output Delivery Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoutputdeliverytypes-form',
    templateUrl: './mjoutputdeliverytypes.form.component.html'
})
export class MJOutputDeliveryTypesFormComponent extends BaseFormComponent {
    public record!: MJOutputDeliveryTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'deliveryTypeDetails', sectionName: 'Delivery Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}

