import { Component } from '@angular/core';
import { MJOutputDeliveryTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Output Delivery Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoutputdeliverytype-form',
    templateUrl: './mjoutputdeliverytype.form.component.html'
})
export class MJOutputDeliveryTypeFormComponent extends BaseFormComponent {
    public record!: MJOutputDeliveryTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'deliveryTypeDetails', sectionName: 'Delivery Type Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJReports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}

