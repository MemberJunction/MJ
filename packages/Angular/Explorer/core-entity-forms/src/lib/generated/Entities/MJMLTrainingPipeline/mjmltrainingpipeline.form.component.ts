import { Component } from '@angular/core';
import { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Training Pipelines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmltrainingpipeline-form',
    templateUrl: './mjmltrainingpipeline.form.component.html'
})
export class MJMLTrainingPipelineFormComponent extends BaseFormComponent {
    public record!: MJMLTrainingPipelineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pipelineOverview', sectionName: 'Pipeline Overview', isExpanded: true },
            { sectionKey: 'modelObjective', sectionName: 'Model Objective', isExpanded: true },
            { sectionKey: 'trainingValidation', sectionName: 'Training & Validation', isExpanded: true },
            { sectionKey: 'featureEngineering', sectionName: 'Feature Engineering', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false },
            { sectionKey: 'mJMLModels', sectionName: 'ML Models', isExpanded: false }
        ]);
    }
}

