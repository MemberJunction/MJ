import { Component } from '@angular/core';
import { MJWorkQueueMessageEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Work Queue Messages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkqueuemessage-form',
    templateUrl: './mjworkqueuemessage.form.component.html'
})
export class MJWorkQueueMessageFormComponent extends BaseFormComponent {
    public record!: MJWorkQueueMessageEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJWorkQueueDeliveries', sectionName: 'Work Queue Deliveries', isExpanded: false }
        ]);
    }
}

