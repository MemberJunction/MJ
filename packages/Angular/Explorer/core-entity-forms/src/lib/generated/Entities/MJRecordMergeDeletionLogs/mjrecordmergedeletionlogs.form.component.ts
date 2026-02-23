import { Component } from '@angular/core';
import { MJRecordMergeDeletionLogsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Record Merge Deletion Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecordmergedeletionlogs-form',
    templateUrl: './mjrecordmergedeletionlogs.form.component.html'
})
export class MJRecordMergeDeletionLogsFormComponent extends BaseFormComponent {
    public record!: MJRecordMergeDeletionLogsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'deletionAudit', sectionName: 'Deletion Audit', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

