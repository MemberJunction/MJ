import { Component } from '@angular/core';
import { MJRecordMergeLogsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Record Merge Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordmergelogs-form',
    templateUrl: './mjrecordmergelogs.form.component.html'
})
export class MJRecordMergeLogsFormComponent extends BaseFormComponent {
    public record!: MJRecordMergeLogsEntity;

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

