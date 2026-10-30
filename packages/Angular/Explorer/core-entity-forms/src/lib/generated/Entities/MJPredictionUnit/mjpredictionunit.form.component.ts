import { Component } from '@angular/core';
import { MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Prediction Units') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjpredictionunit-form',
    templateUrl: './mjpredictionunit.form.component.html'
})
export class MJPredictionUnitFormComponent extends BaseFormComponent {
    public record!: MJPredictionUnitEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'predictionDefinition', sectionName: 'Prediction Definition', isExpanded: true },
            { sectionKey: 'unitAndGrainConfiguration', sectionName: 'Unit and Grain Configuration', isExpanded: true },
            { sectionKey: 'outcomeAndLabeling', sectionName: 'Outcome and Labeling', isExpanded: true },
            { sectionKey: 'taskAndDecisionSettings', sectionName: 'Task and Decision Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJPredictionUnits', sectionName: 'Prediction Units', isExpanded: false },
            { sectionKey: 'mJTrainingSnapshots', sectionName: 'Training Snapshots', isExpanded: false },
            { sectionKey: 'mJMLTrainingPipelines', sectionName: 'ML Training Pipelines', isExpanded: false }
        ]);
    }
}

