import { Component } from '@angular/core';
import { MJMLPredictionUnitEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Prediction Units') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlpredictionunit-form',
    templateUrl: './mjmlpredictionunit.form.component.html'
})
export class MJMLPredictionUnitFormComponent extends BaseFormComponent {
    public record!: MJMLPredictionUnitEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'lineageAndVersioning', sectionName: 'Lineage and Versioning', isExpanded: true },
            { sectionKey: 'predictionDefinition', sectionName: 'Prediction Definition', isExpanded: true },
            { sectionKey: 'dataAndFeatureConfiguration', sectionName: 'Data and Feature Configuration', isExpanded: true },
            { sectionKey: 'outcomeAndLabeling', sectionName: 'Outcome and Labeling', isExpanded: true },
            { sectionKey: 'modelExecutionAndGovernance', sectionName: 'Model Execution and Governance', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLPredictionUnits', sectionName: 'ML Prediction Units', isExpanded: false },
            { sectionKey: 'mJMLTrainingSnapshots', sectionName: 'ML Training Snapshots', isExpanded: false },
            { sectionKey: 'mJMLTrainingPipelines', sectionName: 'ML Training Pipelines', isExpanded: false }
        ]);
    }
}

