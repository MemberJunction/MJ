import { Component } from '@angular/core';
import { MJMLModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Models') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlmodel-form',
    templateUrl: './mjmlmodel.form.component.html'
})
export class MJMLModelFormComponent extends BaseFormComponent {
    public record!: MJMLModelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelIdentityLineage', sectionName: 'Model Identity & Lineage', isExpanded: true },
            { sectionKey: 'featuresSchema', sectionName: 'Features & Schema', isExpanded: true },
            { sectionKey: 'trainingPerformance', sectionName: 'Training & Performance', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false },
            { sectionKey: 'mJMLModelScoringBindings', sectionName: 'ML Model Scoring Bindings', isExpanded: false }
        ]);
    }
}

