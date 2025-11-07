import { Component } from '@angular/core';
import { ReportSnapshotEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Report Snapshots') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reportsnapshot-form',
    templateUrl: './reportsnapshot.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportSnapshotFormComponent extends BaseFormComponent {
    public record!: ReportSnapshotEntity;

    // Collapsible section state
    public sectionsExpanded = {
        snapshotIdentification: true,
        snapshotDescriptors: true,
        systemMetadata: false
    };

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadReportSnapshotFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
