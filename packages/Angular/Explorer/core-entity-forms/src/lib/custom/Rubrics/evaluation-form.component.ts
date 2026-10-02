import { Component } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import { RegisterClass, RegisterClassEx } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel, BaseFormPolicy, BaseFormsModule, type FormChromeContext, type FormChromeSpec } from '@memberjunction/ng-base-forms';
import { RubricComparisonMatrixComponent, RubricResultComponent, BandFromRow, NodeFromRow, ScaleFromRow, type RubricFormAnswer } from '@memberjunction/ng-rubrics';
import type { RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { MJRubricEvaluationFormComponent } from '../../generated/Entities/MJRubricEvaluation/mjrubricevaluation.form.component';

/** Cohort figures stay hidden until the viewer's own evaluation leaves Draft. */
export const HIDDEN_DRAFT_EVALUATION_FIELDS = [
    'CohortEvaluationCount',
    'CohortScoredCount',
    'CohortPassedCount',
    'CohortMeanScore',
    'CohortMinScore',
    'CohortMaxScore',
    'CohortScoreStdDev',
    'CohortHumanCount',
    'CohortHumanMeanScore',
    'CohortAICount',
    'CohortAIMeanScore',
    'DeviationFromCohortMean',
] as const;

/** Evaluation form. Loads the stored result and the cohort, and shows the read-only widgets. */
@RegisterClass(BaseFormComponent, 'MJ: Rubric Evaluations')
@Component({
    standalone: false,
    selector: 'mj-rubric-evaluation-form',
    templateUrl: '../../generated/Entities/MJRubricEvaluation/mjrubricevaluation.form.component.html',
})
export class MJRubricEvaluationFormComponentExtended extends MJRubricEvaluationFormComponent {
    public override record!: MJRubricEvaluationEntity;

    public override get formContext() {
        const context = super.formContext;
        if (this.record?.Status !== 'Draft') return context;
        return { ...context, hiddenFieldNames: [...HIDDEN_DRAFT_EVALUATION_FIELDS] };
    }
    public Loading = true;
    public Result: RubricScoreResult | null = null;
    public Version: RubricVersionSnapshot | null = null;
    public Answers: RubricFormAnswer[] = [];

    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        await this.LoadResult();
    }

    public async LoadResult(): Promise<void> {
        this.Loading = true;
        try {
            const scores = await this.rows('MJ: Rubric Evaluation Scores', `EvaluationID='${this.record.ID}'`);
            this.Answers = scores.map(row => ({
                criterionId: String(row.CriterionID),
                rationale: row.Rationale == null ? undefined : String(row.Rationale),
                evidence: row.Evidence == null ? undefined : String(row.Evidence),
            }));
            const criterionLabel = (row: Record<string, unknown>) => String(row.Criterion || row.CriterionKey || row.CriterionID);
            this.Result = {
                normalizedScore: this.record.NormalizedScore ?? null,
                completeness: this.record.Completeness ?? null,
                outcome: (this.record.Outcome ?? 'Incomplete') as RubricScoreResult['outcome'],
                passed: this.record.Passed ?? null,
                gateFailed: this.record.GateFailed === true,
                passThresholdApplied: this.record.PassThresholdApplied ?? null,
                bandId: this.record.BandID ?? null,
                confidence: this.record.Confidence ?? null,
                scoredCriteriaCount: this.record.ScoredCriteriaCount ?? 0,
                applicableCriteriaCount: this.record.ApplicableCriteriaCount ?? 0,
                totalCriteriaCount: this.record.TotalCriteriaCount ?? 0,
                scoringEngineVersion: '1.0',
                nodes: scores.map(row => ({
                    id: String(row.CriterionID),
                    key: criterionLabel(row),
                    normalizedScore: row.NormalizedScore == null ? null : Number(row.NormalizedScore),
                    effectiveWeight: Number(row.EffectiveWeight ?? 0),
                    overallContribution: row.OverallContribution == null ? null : Number(row.OverallContribution),
                    completeness: row.Completeness == null ? null : Number(row.Completeness),
                    confidence: row.Confidence == null ? null : Number(row.Confidence),
                    gateFailed: row.GateFailed === true || row.GateFailed === 1,
                    isNotApplicable: row.IsNotApplicable === true || row.IsNotApplicable === 1,
                    isAdvisory: row.IsAdvisory === true || row.IsAdvisory === 1,
                })),
            };
            const versions = await this.rows('MJ: Rubric Versions', `ID='${this.record.RubricVersionID}'`);
            const version = versions[0];
            if (version) {
                const bands = (await this.rows('MJ: Rubric Bands', `RubricVersionID='${version.ID}'`)).map(BandFromRow);
                const criteria = (await this.rows('MJ: Rubric Criteria', `RubricVersionID='${version.ID}'`)).map(row => NodeFromRow(row));
                const scaleIds = [...new Set(criteria.map(node => node.scaleId).filter((id): id is string => !!id))];
                const scales = scaleIds.length === 0 ? [] : (await this.rows('MJ: Rubric Scales', `ID IN (${scaleIds.map(id => `'${id}'`).join(',')})`)).map(row => ScaleFromRow(row, []));
                this.Version = {
                    id: String(version.ID),
                    rubricId: String(version.RubricID),
                    notApplicablePolicy: (version.NotApplicablePolicy as RubricVersionSnapshot['notApplicablePolicy']) ?? 'ExcludeAndRedistribute',
                    scoreDisplayMin: version.ScoreDisplayMin == null ? 0 : Number(version.ScoreDisplayMin),
                    scoreDisplayMax: version.ScoreDisplayMax == null ? 100 : Number(version.ScoreDisplayMax),
                    nodes: criteria,
                    scales,
                    bands,
                };
            }
        } finally {
            this.Loading = false;
        }
    }

    private async rows(entityName: string, filter: string): Promise<Record<string, unknown>[]> {
        const view = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 500 }, this.ProviderToUse.CurrentUser);
        return (result.Results ?? []) as Record<string, unknown>[];
    }
}

/** The evaluation record uses the left-nav rail. Result and comparison are their own items. */
@RegisterClassEx(BaseFormPolicy, { key: 'MJ: Rubric Evaluations', metadata: { entity: 'MJ: Rubric Evaluations' } })
export class RubricEvaluationFormPolicy extends BaseFormPolicy {
    public override DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        return { ...spec, Layout: 'left-nav' };
    }
}

function evaluationForm(panel: BaseFormPanel<MJRubricEvaluationEntity>): MJRubricEvaluationFormComponentExtended {
    return panel.FormComponent as MJRubricEvaluationFormComponentExtended;
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJRubricEvaluations:result',
    metadata: {
        entity: 'MJ: Rubric Evaluations',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'rubric-eval-result',
        inclusion: 'Primary',
        leadsWhenUnsaved: true,
    },
})
@Component({
    selector: 'mj-rubric-eval-result-panel',
    standalone: true,
    imports: [BaseFormsModule, RubricResultComponent],
    template: `
      <mj-collapsible-panel SectionKey="rubric-eval-result" SectionName="Result" Icon="fa-solid fa-square-poll-vertical" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
        @if (Form.Loading) {
          <p>Loading the evaluation...</p>
        } @else {
          <mj-rubric-result [Version]="Form.Version" [Result]="Form.Result" [Answers]="Form.Answers"></mj-rubric-result>
        }
      </mj-collapsible-panel>
    `,
})
export class RubricEvaluationResultPanel extends BaseFormPanel<MJRubricEvaluationEntity> {
    public get Form(): MJRubricEvaluationFormComponentExtended { return evaluationForm(this); }
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJRubricEvaluations:compare',
    metadata: {
        entity: 'MJ: Rubric Evaluations',
        slot: 'before-fields',
        sortKey: 90,
        contributionKey: 'rubric-eval-compare',
        inclusion: 'Primary',
    },
})
@Component({
    selector: 'mj-rubric-eval-compare-panel',
    standalone: true,
    imports: [BaseFormsModule, RubricComparisonMatrixComponent],
    template: `
      <mj-collapsible-panel SectionKey="rubric-eval-compare" SectionName="Comparison" Icon="fa-solid fa-table-cells" [Form]="FormComponent" [FormContext]="FormContext" [DefaultExpanded]="true">
        @if (Form.Loading) {
          <p>Loading the cohort...</p>
        } @else {
          <mj-rubric-comparison-matrix [Provider]="Form.ProviderToUse" [RubricId]="Form.record.RubricID" [Major]="Form.record.RubricMajorVersion" [SubjectEntityId]="Form.record.SubjectEntityID" [ViewerStatus]="Form.record.Status" [ViewerEvaluationId]="Form.record.ID"></mj-rubric-comparison-matrix>
        }
      </mj-collapsible-panel>
    `,
})
export class RubricEvaluationComparePanel extends BaseFormPanel<MJRubricEvaluationEntity> {
    public get Form(): MJRubricEvaluationFormComponentExtended { return evaluationForm(this); }
}
