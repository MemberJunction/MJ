import { Component } from '@angular/core';
import { QueueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Queues') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queue-form',
    templateUrl: './queue.form.component.html'
})
export class QueueFormComponent extends BaseFormComponent {
    public record!: QueueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'queueDefinition', sectionName: 'Queue Definition', isExpanded: true },
            { sectionKey: 'operationalStatus', sectionName: 'Operational Status', isExpanded: true },
            { sectionKey: 'processEnvironment', sectionName: 'Process Environment', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'queueTasks', sectionName: 'Queue Tasks', isExpanded: false }
        ]);
    }
}

export function LoadQueueFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
