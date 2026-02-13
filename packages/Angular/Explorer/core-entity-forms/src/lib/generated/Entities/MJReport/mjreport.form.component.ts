import { Component } from '@angular/core';
import { MJReportEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Reports') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjreport-form',
    templateUrl: './mjreport.form.component.html'
})
export class MJReportFormComponent extends BaseFormComponent {
    public record!: MJReportEntity;

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

