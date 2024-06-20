import { Component } from '@angular/core';
import { QueueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadQueueDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Queues') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queue-form',
    templateUrl: './queue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueueFormComponent extends BaseFormComponent {
    public record!: QueueEntity;
} 

export function LoadQueueFormComponent() {
    LoadQueueDetailsComponent();
}
