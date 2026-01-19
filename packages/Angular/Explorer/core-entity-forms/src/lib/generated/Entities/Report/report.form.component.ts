import { Component } from '@angular/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Reports') // Tell MemberJunction about this class
@Component({
    selector: 'gen-report-form',
    templateUrl: './report.form.component.html'
})
export class ReportFormComponent extends BaseFormComponent {
    public record!: ReportEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'reportDetails', sectionName: 'Report Details', isExpanded: true },
            { sectionKey: 'dataContextRelationships', sectionName: 'Data Context & Relationships', isExpanded: true },
            { sectionKey: 'outputScheduling', sectionName: 'Output & Scheduling', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reportSnapshots', sectionName: 'Report Snapshots', isExpanded: false },
            { sectionKey: 'mJReportVersions', sectionName: 'MJ: Report Versions', isExpanded: false },
            { sectionKey: 'mJReportUserStates', sectionName: 'MJ: Report User States', isExpanded: false }
        ]);
    }
}

export function LoadReportFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
