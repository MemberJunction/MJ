import { Component } from '@angular/core';
import { MJReportSnapshotsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Report Snapshots') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjreportsnapshots-form',
    templateUrl: './mjreportsnapshots.form.component.html'
})
export class MJReportSnapshotsFormComponent extends BaseFormComponent {
    public record!: MJReportSnapshotsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'snapshotIdentification', sectionName: 'Snapshot Identification', isExpanded: true },
            { sectionKey: 'snapshotDescriptors', sectionName: 'Snapshot Descriptors', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

