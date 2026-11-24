import { Component } from '@angular/core';
import { MJMLTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Training Snapshots') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmltrainingsnapshot-form',
    templateUrl: './mjmltrainingsnapshot.form.component.html'
})
export class MJMLTrainingSnapshotFormComponent extends BaseFormComponent {
    public record!: MJMLTrainingSnapshotEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'snapshotIdentity', sectionName: 'Snapshot Identity', isExpanded: true },
            { sectionKey: 'configurationReferences', sectionName: 'Configuration References', isExpanded: true },
            { sectionKey: 'fileStorageMetadata', sectionName: 'File Storage Metadata', isExpanded: false },
            { sectionKey: 'rowMetricsAndStatistics', sectionName: 'Row Metrics and Statistics', isExpanded: true },
            { sectionKey: 'schemaAndFeatures', sectionName: 'Schema and Features', isExpanded: true },
            { sectionKey: 'exclusionsAndMetrics', sectionName: 'Exclusions and Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false },
            { sectionKey: 'mJMLModels', sectionName: 'ML Models', isExpanded: false }
        ]);
    }
}

