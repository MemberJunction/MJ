import { Component } from '@angular/core';
import { QueueTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Queue Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-queuetype-form',
    templateUrl: './queuetype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class QueueTypeFormComponent extends BaseFormComponent {
    public record!: QueueTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        queues: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadQueueTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
