import { Component } from '@angular/core';
import { MJRecordMergeLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Record Merge Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordmergelog-form',
    templateUrl: './mjrecordmergelog.form.component.html'
})
export class MJRecordMergeLogFormComponent extends BaseFormComponent {
    public record!: MJRecordMergeLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'mergeIdentification', sectionName: 'Merge Identification', isExpanded: true },
            { sectionKey: 'userActionsApprovals', sectionName: 'User Actions & Approvals', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJDuplicateRunDetailMatches', sectionName: 'Duplicate Run Detail Matches', isExpanded: false },
            { sectionKey: 'mJRecordMergeDeletionLogs', sectionName: 'Record Merge Deletion Logs', isExpanded: false }
        ]);
    }
}

