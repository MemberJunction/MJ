import { Component } from '@angular/core';
import { ReportSnapshotEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Report Snapshots') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-reportsnapshot-form',
    templateUrl: './reportsnapshot.form.component.html'
})
export class ReportSnapshotFormComponent extends BaseFormComponent {
    public record!: ReportSnapshotEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'snapshotIdentification', sectionName: 'Snapshot Identification', isExpanded: true },
            { sectionKey: 'snapshotDescriptors', sectionName: 'Snapshot Descriptors', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

