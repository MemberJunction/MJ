import { Component } from '@angular/core';
import { RecordMergeLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Record Merge Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-recordmergelog-form',
    templateUrl: './recordmergelog.form.component.html'
})
export class RecordMergeLogFormComponent extends BaseFormComponent {
    public record!: RecordMergeLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mergeIdentification', sectionName: 'Merge Identification', isExpanded: true },
            { sectionKey: 'userActionsApprovals', sectionName: 'User Actions & Approvals', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'duplicateRunDetailMatches', sectionName: 'Duplicate Run Detail Matches', isExpanded: false },
            { sectionKey: 'recordMergeDeletionLogs', sectionName: 'Record Merge Deletion Logs', isExpanded: false }
        ]);
    }
}

export function LoadRecordMergeLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
