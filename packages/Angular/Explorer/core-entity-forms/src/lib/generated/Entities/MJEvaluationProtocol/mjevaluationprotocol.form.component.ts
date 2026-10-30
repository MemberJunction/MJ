import { Component } from '@angular/core';
import { MJEvaluationProtocolEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Evaluation Protocols') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjevaluationprotocol-form',
    templateUrl: './mjevaluationprotocol.form.component.html'
})
export class MJEvaluationProtocolFormComponent extends BaseFormComponent {
    public record!: MJEvaluationProtocolEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'versionControl', sectionName: 'Version Control', isExpanded: true },
            { sectionKey: 'protocolDetails', sectionName: 'Protocol Details', isExpanded: true },
            { sectionKey: 'validationAndHoldout', sectionName: 'Validation and Holdout', isExpanded: true },
            { sectionKey: 'metricsAndScoring', sectionName: 'Metrics and Scoring', isExpanded: true },
            { sectionKey: 'modelConfiguration', sectionName: 'Model Configuration', isExpanded: true },
            { sectionKey: 'promotionAndOutcomes', sectionName: 'Promotion and Outcomes', isExpanded: true },
            { sectionKey: 'auditsAndGuards', sectionName: 'Audits and Guards', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTrainingSnapshots', sectionName: 'Training Snapshots', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false },
            { sectionKey: 'mJMLTrainingPipelines', sectionName: 'ML Training Pipelines', isExpanded: false },
            { sectionKey: 'mJEvaluationProtocols', sectionName: 'Evaluation Protocols', isExpanded: false }
        ]);
    }
}

