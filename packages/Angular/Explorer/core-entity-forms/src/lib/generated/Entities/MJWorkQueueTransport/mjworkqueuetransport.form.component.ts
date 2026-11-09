import { Component } from '@angular/core';
import { MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Work Queue Transports') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkqueuetransport-form',
    templateUrl: './mjworkqueuetransport.form.component.html'
})
export class MJWorkQueueTransportFormComponent extends BaseFormComponent {
    public record!: MJWorkQueueTransportEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJWorkQueueTopics', sectionName: 'Work Queue Topics', isExpanded: false }
        ]);
    }
}

