import { Component } from '@angular/core';
import { QueueTaskEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadQueueTaskDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Queue Tasks') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queuetask-form',
    templateUrl: './queuetask.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueueTaskFormComponent extends BaseFormComponent {
    public record: QueueTaskEntity | null = null;
} 

export function LoadQueueTaskFormComponent() {
    LoadQueueTaskDetailsComponent();
}
