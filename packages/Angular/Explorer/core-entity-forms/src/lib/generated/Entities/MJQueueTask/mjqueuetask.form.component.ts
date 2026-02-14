import { Component } from '@angular/core';
import { MJQueueTaskEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Queue Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjqueuetask-form',
    templateUrl: './mjqueuetask.form.component.html'
})
export class MJQueueTaskFormComponent extends BaseFormComponent {
    public record!: MJQueueTaskEntity;

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

