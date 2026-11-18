import { Component, OnInit } from '@angular/core';
import type { RunViewParams } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, RegisterClassEx } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPolicy, FormChromeContext, FormChromeSpec } from '@memberjunction/ng-base-forms';
import { MJMLModelFormComponent } from '../../generated/Entities/MJMLModel/mjmlmodel.form.component';

/**
 * Custom form override for `MJ: ML Models` (priority 100).
 * Presents the ML Model in a left-nav experience with:
 * - Lead panel: "Overview & Lifecycle" (<ps-model-detail>)
 * - Details card: Model Identity & Status, Schema & Configuration, Training & Performance
 * - Related grids: ML Training Runs, and the ML Model Scoring Bindings of the model's pipeline (a binding names its
 *   training pipeline and scores with whichever version of it is Published)
 * - More folder: System Metadata
 */
@RegisterClass(BaseFormComponent, 'MJ: ML Models', 100)
@Component({
    standalone: false,
    selector: 'mj-ml-model-form-extended',
    templateUrl: './ml-model-form.component.html',
    styleUrls: ['./ml-model-form.component.css'],
})
export class MLModelFormComponentExtended extends MJMLModelFormComponent implements OnInit {
    override async ngOnInit() {
        await super.ngOnInit();
        this.initPipelineBindings();
        this.initSections([
            { sectionKey: 'modelOverview', sectionName: 'Overview & Lifecycle', isExpanded: true },
            { sectionKey: 'modelIdentityStatus', sectionName: 'Model Identity & Status', isExpanded: true },
            { sectionKey: 'schemaConfiguration', sectionName: 'Schema & Configuration', isExpanded: true },
            { sectionKey: 'trainingPerformance', sectionName: 'Training & Performance', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLTrainingRuns', sectionName: 'ML Training Runs', isExpanded: false },
            { sectionKey: 'mJMLModelScoringBindings', sectionName: 'ML Model Scoring Bindings', isExpanded: false }
        ]);
    }

    /** The scoring bindings section's grid: the bindings of this model's training pipeline (set on init). */
    public PipelineBindingsParams: RunViewParams = {};

    /** A new binding created from the section binds this model's training pipeline (set on init). */
    public PipelineBindingNewValues: Record<string, unknown> = {};

    /** The bindings section's grid parameters and new-record values for the record's pipeline. */
    private initPipelineBindings(): void {
        const pipelineId = this.record?.PipelineID;
        if (!pipelineId) return;
        this.PipelineBindingsParams = {
            EntityName: 'MJ: ML Model Scoring Bindings',
            ExtraFilter: `MLTrainingPipelineID='${EscapeSQLString(pipelineId)}'`,
            OrderBy: '__mj_CreatedAt ASC',
        };
        this.PipelineBindingNewValues = { MLTrainingPipelineID: pipelineId };
    }
}

/**
 * Policy ensuring that the Overview & Lifecycle panel sits as the lead group
 * before the Details group on the left-nav rail.
 */
@RegisterClassEx(BaseFormPolicy, { key: 'MJ: ML Models', metadata: { entity: 'MJ: ML Models' } })
export class MLModelFormPolicy extends BaseFormPolicy {
    public override DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        const overview = spec.Groups.find(g => g.Key === 'modelOverview');
        if (overview) {
            overview.IsLead = true;
            const remaining = spec.Groups.filter(g => g.Key !== 'modelOverview');
            return {
                ...spec,
                Groups: [overview, ...remaining],
            };
        }
        return spec;
    }
}

/** Tree-shaking guard so the override and policy register with the ClassFactory. */
export function LoadMLModelFormComponentExtended(): void {
    void MLModelFormComponentExtended;
    void MLModelFormPolicy;
}
