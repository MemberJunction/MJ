import { Component } from '@angular/core';
import { MJMLEvaluationProtocolEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Evaluation Protocols') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlevaluationprotocol-form',
    templateUrl: './mjmlevaluationprotocol.form.component.html'
})
export class MJMLEvaluationProtocolFormComponent extends BaseFormComponent {
    public record!: MJMLEvaluationProtocolEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'basicInformation', sectionName: 'Basic Information', isExpanded: true },
            { sectionKey: 'validationAndSplits', sectionName: 'Validation and Splits', isExpanded: true },
            { sectionKey: 'metricsAndEvaluation', sectionName: 'Metrics and Evaluation', isExpanded: true },
            { sectionKey: 'guardsAndGovernance', sectionName: 'Guards and Governance', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingSnapshots', sectionName: 'ML Training Snapshots', isExpanded: false },
            { sectionKey: 'mJMLEvaluationProtocols', sectionName: 'ML Evaluation Protocols', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false },
            { sectionKey: 'mJMLTrainingPipelines', sectionName: 'ML Training Pipelines', isExpanded: false },
            { sectionKey: 'mJMLModels', sectionName: 'ML Models', isExpanded: false }
        ]);
    }
}

