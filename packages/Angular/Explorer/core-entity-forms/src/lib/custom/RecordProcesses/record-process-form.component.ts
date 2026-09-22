import { Component, OnInit } from '@angular/core';
import { RegisterClass, RegisterClassEx } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPolicy, FormChromeContext, FormChromeSpec } from '@memberjunction/ng-base-forms';
import { MJRecordProcessFormComponent } from '../../generated/Entities/MJRecordProcess/mjrecordprocess.form.component';

/**
 * Custom form override for `MJ: Record Processes` (priority 100).
 * Presents the Record Process / Feature Pipeline in a first-class MJ form with:
 * - Lead panel: "Overview & Status" with hero KPI summary, target entity badge, and trigger diagnostics.
 * - Builder panel: "Pipeline Configuration" embedding the visual <mj-feature-pipeline-builder> for Infer / Feature Pipelines,
 *   or the <mj-record-process-editor> for Field Rules.
 * - History panel: "Prior Runs" embedding <mj-record-process-history> with run status, metrics, and per-record diff drill-down.
 * - Standard field sections: Process Definition, Execution Logic, Scope Configuration, Triggers, Performance & Optimization.
 * - Related entity sections: Watermarks, ML Model Scoring Bindings, Feature Values, Feature Value Caches.
 * - System Metadata panel.
 */
@RegisterClass(BaseFormComponent, 'MJ: Record Processes', 100)
@Component({
    standalone: false,
    selector: 'mj-record-process-form-extended',
    templateUrl: './record-process-form.component.html',
    styleUrls: ['./record-process-form.component.css'],
})
export class RecordProcessFormComponentExtended extends MJRecordProcessFormComponent implements OnInit {
    public pipelineValid = true;

    override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'processOverview', sectionName: 'Overview & Status', isExpanded: true },
            { sectionKey: 'pipelineConfiguration', sectionName: 'Pipeline Configuration', isExpanded: true },
            { sectionKey: 'processRuns', sectionName: 'Prior Runs', isExpanded: true },
            { sectionKey: 'processDefinition', sectionName: 'Process Definition', isExpanded: true },
            { sectionKey: 'executionLogic', sectionName: 'Execution Logic', isExpanded: false },
            { sectionKey: 'scopeConfiguration', sectionName: 'Scope Configuration', isExpanded: true },
            { sectionKey: 'triggers', sectionName: 'Triggers', isExpanded: true },
            { sectionKey: 'performanceAndOptimization', sectionName: 'Performance & Optimization', isExpanded: false },
            { sectionKey: 'mJRecordProcessWatermarks', sectionName: 'Record Process Watermarks', isExpanded: false },
            { sectionKey: 'mJMLModelScoringBindings', sectionName: 'ML Model Scoring Bindings', isExpanded: false },
            { sectionKey: 'mJFeatureValues', sectionName: 'Feature Values', isExpanded: false },
            { sectionKey: 'mJFeatureValueCaches', sectionName: 'Feature Value Caches', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
        ]);
    }

    public get TargetEntityName(): string {
        if (!this.record?.EntityID) return '—';
        const entity = this.ProviderToUse.EntityByID(this.record.EntityID);
        return entity?.DisplayName || entity?.Name || this.record.EntityID;
    }

    public get WorkTypeIcon(): string {
        switch (this.record?.WorkType) {
            case 'Infer':
                return 'fa-solid fa-wand-magic-sparkles';
            case 'FieldRules':
                return 'fa-solid fa-table-list';
            case 'ML Model':
                return 'fa-solid fa-brain';
            case 'Action':
                return 'fa-solid fa-bolt';
            case 'Agent':
                return 'fa-solid fa-robot';
            default:
                return 'fa-solid fa-gears';
        }
    }

    public get StatusBadgeClass(): string {
        switch (this.record?.Status) {
            case 'Active':
                return 'rpf-status-active';
            case 'Draft':
                return 'rpf-status-draft';
            case 'Disabled':
                return 'rpf-status-disabled';
            default:
                return 'rpf-status-default';
        }
    }

    public OnPipelineSpecChange(): void {
        this.cdr.markForCheck();
    }

    public OnPipelineValidChange(valid: boolean): void {
        this.pipelineValid = valid;
        this.cdr.markForCheck();
    }
}

/**
 * Form policy ensuring the Overview & Status panel sits as the lead group
 * before Details on the left-nav rail.
 */
@RegisterClassEx(BaseFormPolicy, { key: 'MJ: Record Processes', metadata: { entity: 'MJ: Record Processes' } })
export class RecordProcessFormPolicy extends BaseFormPolicy {
    public override DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        const overview = spec.Groups.find(g => g.Key === 'processOverview');
        if (overview) {
            overview.IsLead = true;
            const remaining = spec.Groups.filter(g => g.Key !== 'processOverview');
            return {
                ...spec,
                Groups: [overview, ...remaining],
            };
        }
        return spec;
    }
}

/** Tree-shaking guard so the override and policy register with the ClassFactory. */
export function LoadRecordProcessFormComponentExtended(): void {
    void RecordProcessFormComponentExtended;
    void RecordProcessFormPolicy;
}
