import { Component } from '@angular/core';
import { MJQueueTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Queue Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueuetypes-form',
    templateUrl: './mjqueuetypes.form.component.html'
})
export class MJQueueTypesFormComponent extends BaseFormComponent {
    public record!: MJQueueTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'queueDefinition', sectionName: 'Queue Definition', isExpanded: true },
            { sectionKey: 'processingDriverSettings', sectionName: 'Processing Driver Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'queues', sectionName: 'Queues', isExpanded: false }
        ]);
    }
}

