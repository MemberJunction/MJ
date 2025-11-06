import { Component } from '@angular/core';
import { QueueTaskEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Queue Tasks') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queuetask-form',
    templateUrl: './queuetask.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueueTaskFormComponent extends BaseFormComponent {
    public record!: QueueTaskEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadQueueTaskFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
