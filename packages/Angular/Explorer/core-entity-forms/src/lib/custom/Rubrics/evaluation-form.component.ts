import { Component } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import { RegisterClass, RegisterClassEx } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel, BaseFormPolicy, BaseFormsModule, type FormChromeContext, type FormChromeSpec } from '@memberjunction/ng-base-forms';
import { RubricComparisonMatrixComponent, RubricResultComponent, bandFromRow, nodeFromRow, scaleFromRow, type MatrixColumn, type RubricFormAnswer, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/ng-rubrics';
import { MJRubricEvaluationFormComponent } from '../../generated/Entities/MJRubricEvaluation/mjrubricevaluation.form.component';

/** Evaluation form. Loads the stored result and the cohort, and shows the read-only widgets. */
@RegisterClass(BaseFormComponent, 'MJ: Rubric Evaluations')
@Component({
    standalone: false,
    selector: 'mj-rubric-evaluation-form',
    templateUrl: '../../generated/Entities/MJRubricEvaluation/mjrubricevaluation.form.component.html',
})
export class MJRubricEvaluationFormComponentExtended extends MJRubricEvaluationFormComponent {
    public override record!: MJRubricEvaluationEntity;
    public Loading = true;
    public Result: RubricScoreResult | null = null;
    public Version: RubricVersionSnapshot | null = null;
    public Answers: RubricFormAnswer[] = [];
    public Columns: MatrixColumn[] = [];
    public Keys: string[] = [];

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
            this.Keys = [...new Set(scores.map(criterionLabel))];
            this.Result = {
                normalizedScore: this.record.NormalizedScore ?? null,
                completeness: this.record.Completeness ?? null,
                outcome: (this.record.Outcome ?? 'Incomplete') as RubricScoreResult['outcome'],
                passed: this.record.Passed ?? null,
                gateFailed: this.record.GateFailed === true,
                passThresholdApplied: this.record.PassThresholdApplied ?? null,
                bandId: this.record.BandID ?? null,
                confidence: this.record.Confidence ?? null,
                scoringEngineVersion: '1.0',
                nodes: scores.map(row => ({
                    id: String(row.CriterionID),
                    key: criterionLabel(row),
                    normalizedScore: row.NormalizedScore == null ? null : Number(row.NormalizedScore),
                    effectiveWeight: Number(row.EffectiveWeight ?? 0),
                    overallContribution: row.OverallContribution == null ? null : Number(row.OverallContribution),
                    gateFailed: row.GateFailed === true || row.GateFailed === 1,
                    isNotApplicable: row.IsNotApplicable === true || row.IsNotApplicable === 1,
                    isAdvisory: row.IsAdvisory === true || row.IsAdvisory === 1,
                })),
            };
            const versions = await this.rows('MJ: Rubric Versions', `ID='${this.record.RubricVersionID}'`);
            const version = versions[0];
            if (version) {
                const bands = (await this.rows('MJ: Rubric Bands', `RubricVersionID='${version.ID}'`)).map(bandFromRow);
                const criteria = (await this.rows('MJ: Rubric Criteria', `RubricVersionID='${version.ID}'`)).map(row => nodeFromRow(row));
                const scaleIds = [...new Set(criteria.map(node => node.scaleId).filter((id): id is string => !!id))];
                const scales = scaleIds.length === 0 ? [] : (await this.rows('MJ: Rubric Scales', `ID IN (${scaleIds.map(id => `'${id}'`).join(',')})`)).map(row => scaleFromRow(row, []));
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
            let cohortFilter = `SubjectRecordID='${this.record.SubjectRecordID}' AND RubricVersionID='${this.record.RubricVersionID}'`;
            if (this.record.ContextRecordID) cohortFilter += ` AND ContextRecordID='${this.record.ContextRecordID}'`;
            const cohort = await this.rows('MJ: Rubric Evaluations', cohortFilter);
            this.Columns = await Promise.all(cohort.map(async row => {
                const cells = await this.rows('MJ: Rubric Evaluation Scores', `EvaluationID='${row.ID}'`);
                return {
                    id: String(row.ID),
                    name: String(row.EvaluatorType ?? 'Evaluation'),
                    evaluatorType: (row.EvaluatorType ?? 'Human') as MatrixColumn['evaluatorType'],
                    status: String(row.Status ?? ''),
                    scores: cells.map(cell => ({ key: criterionLabel(cell), normalizedScore: cell.NormalizedScore == null ? null : Number(cell.NormalizedScore), rationale: cell.Rationale == null ? '' : String(cell.Rationale) })),
                };
            }));
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
          <mj-rubric-comparison-matrix [Keys]="Form.Keys" [Columns]="Form.Columns"></mj-rubric-comparison-matrix>
        }
      </mj-collapsible-panel>
    `,
})
export class RubricEvaluationComparePanel extends BaseFormPanel<MJRubricEvaluationEntity> {
    public get Form(): MJRubricEvaluationFormComponentExtended { return evaluationForm(this); }
}
