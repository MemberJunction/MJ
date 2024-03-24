import { Component } from '@angular/core';
import { QueueTaskEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQueueTaskDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Queue Tasks') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queuetask-form',
    templateUrl: './queuetask.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueueTaskFormComponent extends BaseFormComponent {
    public record!: QueueTaskEntity;
} 

export function LoadQueueTaskFormComponent() {
    LoadQueueTaskDetailsComponent();
}
