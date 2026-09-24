import { Component } from '@angular/core';
import { MJWorkQueueSubscriptionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Work Queue Subscriptions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkqueuesubscription-form',
    templateUrl: './mjworkqueuesubscription.form.component.html'
})
export class MJWorkQueueSubscriptionFormComponent extends BaseFormComponent {
    public record!: MJWorkQueueSubscriptionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJWorkQueueDeliveries', sectionName: 'Work Queue Deliveries', isExpanded: false }
        ]);
    }
}

