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
            { sectionKey: 'modelDefinition', sectionName: 'Model Definition', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'validationAndSafety', sectionName: 'Validation and Safety', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false },
            { sectionKey: 'mJMLModels', sectionName: 'ML Models', isExpanded: false }
        ]);
    }
}

