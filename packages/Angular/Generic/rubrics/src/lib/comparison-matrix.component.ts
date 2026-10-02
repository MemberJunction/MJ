import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ComparisonCohortFilter, ComparisonMatrix, MatrixColumnsFromRows, type MatrixColumn, type MatrixModel } from './model.js';

/** Evaluators across, criteria down. Disagreeing cells are marked. Self is its own column. */
@Component({
    standalone: true,
    selector: 'mj-rubric-comparison-matrix',
    imports: [CommonModule],
    templateUrl: './comparison-matrix.component.html',
    styleUrls: ['./rubric-builder.component.css'],
})
export class RubricComparisonMatrixComponent implements OnChanges {
    @Input() Keys: string[] = [];
    @Input() Columns: MatrixColumn[] = [];
    @Input() Provider: IMetadataProvider | null = null;
    @Input() RubricId = '';
    @Input() Major: number | null = null;
    @Input() SubjectEntityId = '';
    /** The viewer's own evaluation. Draft hides cohort figures and other people's rationales. */
    @Input() ViewerStatus = '';
    @Input() ViewerEvaluationId = '';
    public CohortMean: number | null = null;

    public get ShowCohort(): boolean {
        return this.ViewerStatus !== 'Draft';
    }

    /** One column per submitted evaluation. AIPrompt and Agent stay separate columns. */
    public get Shown(): MatrixColumn[] {
        return this.Columns;
    }

    public async ngOnChanges(): Promise<void> {
        if (!this.Provider || !this.RubricId || this.Major == null || !this.SubjectEntityId) return;
        const filter = ComparisonCohortFilter(this.RubricId, this.Major, this.SubjectEntityId);
        const view = RunView.FromMetadataProvider(this.Provider);
        const [evaluations, scores] = await view.RunViews([
            { EntityName: 'MJ: Rubric Evaluations', ExtraFilter: filter, ResultType: 'simple', MaxRows: 200 },
            { EntityName: 'MJ: Rubric Evaluation Scores', ExtraFilter: `IsComputed=0 AND EvaluationID IN (SELECT ID FROM vwRubricEvaluations WHERE ${filter})`, ResultType: 'simple', MaxRows: 2000 },
        ], this.Provider.CurrentUser as UserInfo);
        if (!evaluations.Success) throw new Error(evaluations.ErrorMessage || 'Could not read rubric evaluations.');
        if (!scores.Success) throw new Error(scores.ErrorMessage || 'Could not read rubric evaluation scores.');
        const rows = (evaluations.Results ?? []) as Record<string, unknown>[];
        this.Columns = MatrixColumnsFromRows(rows, (scores.Results ?? []) as Record<string, unknown>[]);
        if (this.Keys.length === 0) this.Keys = [...new Set(this.Columns.flatMap(column => column.scores.map(score => score.key)))];
        const cohort = rows.find(row => row.CohortMeanScore != null);
        this.CohortMean = cohort == null ? null : Number(cohort.CohortMeanScore);
    }

    public ScoreText(column: MatrixColumn, key: string): string {
        const score = column.scores.find(item => item.key === key);
        if (!score || score.normalizedScore == null) return column.status === 'Disabled' ? 'Disabled' : 'No score yet';
        return String(score.normalizedScore);
    }

    public RationaleText(column: MatrixColumn, key: string): string {
        if (!this.ShowCohort && column.id !== this.ViewerEvaluationId) return '';
        return column.scores.find(item => item.key === key)?.rationale || '';
    }

    public get Model(): MatrixModel {
        return ComparisonMatrix(this.Keys, this.Shown);
    }

    public Cell(row: { cells: { columnId: string; score: number | null; disagree: boolean }[] }, columnId: string): { columnId: string; score: number | null; disagree: boolean } | null {
        return row.cells.find(cell => cell.columnId === columnId) ?? null;
    }
}
