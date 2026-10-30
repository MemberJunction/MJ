import { Component } from '@angular/core';
import { MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Training Snapshots') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtrainingsnapshot-form',
    templateUrl: './mjtrainingsnapshot.form.component.html'
})
export class MJTrainingSnapshotFormComponent extends BaseFormComponent {
    public record!: MJTrainingSnapshotEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'snapshotIdentity', sectionName: 'Snapshot Identity', isExpanded: true },
            { sectionKey: 'fileStorage', sectionName: 'File Storage', isExpanded: true },
            { sectionKey: 'rowStatistics', sectionName: 'Row Statistics', isExpanded: true },
            { sectionKey: 'featureSpecifications', sectionName: 'Feature Specifications', isExpanded: true },
            { sectionKey: 'rowProcessingExclusions', sectionName: 'Row Processing Exclusions', isExpanded: true },
            { sectionKey: 'assemblyMetadata', sectionName: 'Assembly Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false }
        ]);
    }
}

