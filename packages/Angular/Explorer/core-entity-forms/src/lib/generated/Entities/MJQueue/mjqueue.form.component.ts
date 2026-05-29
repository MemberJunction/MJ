import { Component } from '@angular/core';
import { MJQueueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Queues') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueue-form',
    templateUrl: './mjqueue.form.component.html'
})
export class MJQueueFormComponent extends BaseFormComponent {
    public record!: MJQueueEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'queueDefinition', sectionName: 'Queue Definition', isExpanded: true },
            { sectionKey: 'operationalStatus', sectionName: 'Operational Status', isExpanded: true },
            { sectionKey: 'processEnvironment', sectionName: 'Process Environment', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJQueueTasks', sectionName: 'Queue Tasks', isExpanded: false }
        ]);
    }
}

