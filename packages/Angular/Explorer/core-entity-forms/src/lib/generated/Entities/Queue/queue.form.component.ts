import { Component } from '@angular/core';
import { QueueEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Queues') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queue-form',
    templateUrl: './queue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueueFormComponent extends BaseFormComponent {
    public record!: QueueEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        queueTasks: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadQueueFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
