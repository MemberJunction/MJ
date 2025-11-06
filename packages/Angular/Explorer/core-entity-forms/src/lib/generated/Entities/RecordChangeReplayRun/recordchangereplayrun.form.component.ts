import { Component } from '@angular/core';
import { RecordChangeReplayRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Record Change Replay Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordchangereplayrun-form',
    templateUrl: './recordchangereplayrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordChangeReplayRunFormComponent extends BaseFormComponent {
    public record!: RecordChangeReplayRunEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        recordChanges: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadRecordChangeReplayRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
