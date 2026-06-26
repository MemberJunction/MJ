import { Component } from '@angular/core';
import { MJMLAlgorithmEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Algorithms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlalgorithm-form',
    templateUrl: './mjmlalgorithm.form.component.html'
})
export class MJMLAlgorithmFormComponent extends BaseFormComponent {
    public record!: MJMLAlgorithmEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'algorithmProfile', sectionName: 'Algorithm Profile', isExpanded: true },
            { sectionKey: 'executionConfiguration', sectionName: 'Execution & Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingPipelines', sectionName: 'ML Training Pipelines', isExpanded: false },
            { sectionKey: 'mJMLModels', sectionName: 'ML Models', isExpanded: false },
            { sectionKey: 'mJMLAlgorithmUseCaseRankings', sectionName: 'ML Algorithm Use Case Rankings', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false }
        ]);
    }
}

