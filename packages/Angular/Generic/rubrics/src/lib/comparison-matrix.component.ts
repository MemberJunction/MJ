import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ComparisonCohortFilter, ComparisonMatrix, ComparisonScoresFilter, MatrixColumnsFromRows, type MatrixColumn, type MatrixModel } from './model.js';

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
    private loadedColumns: MatrixColumn[] | null = null;
    private loadedKeys: string[] | null = null;

    public get ShowCohort(): boolean {
        return this.ViewerStatus !== 'Draft';
    }

    /** One column per submitted evaluation. AIPrompt and Agent stay separate columns. */
    public get Shown(): MatrixColumn[] {
        return this.loadedColumns ?? this.Columns;
    }

    public async ngOnChanges(): Promise<void> {
        if (!this.Provider || !this.RubricId || this.Major == null || !this.SubjectEntityId) {
            this.loadedColumns = null;
            this.loadedKeys = null;
            return;
        }
        const view = RunView.FromMetadataProvider(this.Provider);
        const user = this.Provider.CurrentUser as UserInfo;
        const evaluations = await view.RunView<Record<string, unknown>>({
            EntityName: 'MJ: Rubric Evaluations',
            ExtraFilter: ComparisonCohortFilter(this.RubricId, this.Major, this.SubjectEntityId),
            ResultType: 'simple',
            MaxRows: 200,
        }, user);
        if (!evaluations.Success) throw new Error(evaluations.ErrorMessage || 'Could not read rubric evaluations.');
        const rows = evaluations.Results ?? [];
        const columns = MatrixColumnsFromRows(rows, await this.loadScores(view, rows, user));
        this.loadedColumns = columns;
        this.loadedKeys = this.Keys.length === 0 ? [...new Set(columns.flatMap(column => column.scores.map(score => score.key)))] : null;
        const cohort = rows.find(row => row.CohortMeanScore != null);
        this.CohortMean = cohort == null ? null : Number(cohort.CohortMeanScore);
    }

    /**
     * The criterion scores of the loaded evaluations, read by evaluation ID. RunView applies the
     * row filters on both entities, so only evaluations the viewer can read contribute scores.
     */
    private async loadScores(view: RunView, evaluations: Record<string, unknown>[], user: UserInfo): Promise<Record<string, unknown>[]> {
        const filter = ComparisonScoresFilter(evaluations.map(row => String(row.ID ?? '')));
        if (!filter) return [];
        const scores = await view.RunView<Record<string, unknown>>({
            EntityName: 'MJ: Rubric Evaluation Scores',
            ExtraFilter: filter,
            ResultType: 'simple',
            MaxRows: 2000,
        }, user);
        if (!scores.Success) throw new Error(scores.ErrorMessage || 'Could not read rubric evaluation scores.');
        return scores.Results ?? [];
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
        return ComparisonMatrix(this.loadedKeys ?? this.Keys, this.Shown);
    }

    public Cell(row: { cells: { columnId: string; score: number | null; disagree: boolean }[] }, columnId: string): { columnId: string; score: number | null; disagree: boolean } | null {
        return row.cells.find(cell => cell.columnId === columnId) ?? null;
    }
}
