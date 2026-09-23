import { Component } from '@angular/core';
import { MJWorkQueueDeliveryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Work Queue Deliveries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkqueuedelivery-form',
    templateUrl: './mjworkqueuedelivery.form.component.html'
})
export class MJWorkQueueDeliveryFormComponent extends BaseFormComponent {
    public record!: MJWorkQueueDeliveryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

