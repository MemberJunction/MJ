import { Component } from '@angular/core';
import { RecordMergeLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Record Merge Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-recordmergelog-form',
    templateUrl: './recordmergelog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class RecordMergeLogFormComponent extends BaseFormComponent {
    public record!: RecordMergeLogEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        duplicateRunDetailMatches: false,
        recordMergeDeletionLogs: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadRecordMergeLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
