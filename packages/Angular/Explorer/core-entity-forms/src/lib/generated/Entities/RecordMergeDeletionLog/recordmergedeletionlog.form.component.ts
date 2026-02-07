import { Component } from '@angular/core';
import { RecordMergeDeletionLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Record Merge Deletion Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-recordmergedeletionlog-form',
    templateUrl: './recordmergedeletionlog.form.component.html'
})
export class RecordMergeDeletionLogFormComponent extends BaseFormComponent {
    public record!: RecordMergeDeletionLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'deletionAudit', sectionName: 'Deletion Audit', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadRecordMergeDeletionLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
