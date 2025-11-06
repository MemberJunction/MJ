import { Component } from '@angular/core';
import { RecordMergeDeletionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Record Merge Deletion Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordmergedeletionlog-form',
    templateUrl: './recordmergedeletionlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordMergeDeletionLogFormComponent extends BaseFormComponent {
    public record!: RecordMergeDeletionLogEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadRecordMergeDeletionLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
