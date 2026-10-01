import { Component } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { bandFromRow, type MatrixColumn, type RubricFormAnswer, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/ng-rubrics';
import { MJRubricEvaluationFormComponent } from '../../generated/Entities/MJRubricEvaluation/mjrubricevaluation.form.component';

/** Evaluation form. Loads the stored result and the cohort, and shows the read-only widgets. */
@RegisterClass(BaseFormComponent, 'MJ: Rubric Evaluations')
@Component({
    standalone: false,
    selector: 'mj-rubric-evaluation-form',
    templateUrl: './evaluation-form.component.html',
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
                this.Version = {
                    id: String(version.ID),
                    rubricId: String(version.RubricID),
                    notApplicablePolicy: (version.NotApplicablePolicy as RubricVersionSnapshot['notApplicablePolicy']) ?? 'ExcludeAndRedistribute',
                    scoreDisplayMin: version.ScoreDisplayMin == null ? 0 : Number(version.ScoreDisplayMin),
                    scoreDisplayMax: version.ScoreDisplayMax == null ? 100 : Number(version.ScoreDisplayMax),
                    nodes: [],
                    scales: [],
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
                    scores: cells.map(cell => ({ key: criterionLabel(cell), normalizedScore: cell.NormalizedScore == null ? null : Number(cell.NormalizedScore) })),
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
