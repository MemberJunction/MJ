import { Component } from '@angular/core';
import { ScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'MJ: Scheduled Jobs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduledjob-form',
    templateUrl: './scheduledjob.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduledJobFormComponent extends BaseFormComponent {
    public record!: ScheduledJobEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        mJScheduledJobRuns: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadScheduledJobFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
