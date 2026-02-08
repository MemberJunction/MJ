import { Component } from '@angular/core';
import { QueueTaskEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Queue Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-queuetask-form',
    templateUrl: './queuetask.form.component.html'
})
export class QueueTaskFormComponent extends BaseFormComponent {
    public record!: QueueTaskEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskIdentityQueue', sectionName: 'Task Identity & Queue', isExpanded: true },
            { sectionKey: 'executionStatusTimeline', sectionName: 'Execution Status & Timeline', isExpanded: true },
            { sectionKey: 'payloadOutcome', sectionName: 'Payload & Outcome', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

