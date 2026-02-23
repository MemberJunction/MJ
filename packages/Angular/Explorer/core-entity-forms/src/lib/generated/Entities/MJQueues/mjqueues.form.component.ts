import { Component } from '@angular/core';
import { MJQueuesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Queues') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueues-form',
    templateUrl: './mjqueues.form.component.html'
})
export class MJQueuesFormComponent extends BaseFormComponent {
    public record!: MJQueuesEntity;

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

