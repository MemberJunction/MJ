import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComparisonMatrix, type MatrixColumn, type MatrixModel } from './model.js';

/** Evaluators across, criteria down. Disagreeing cells are marked. Self is its own column. */
@Component({
    standalone: true,
    selector: 'mj-rubric-comparison-matrix',
    imports: [CommonModule],
    templateUrl: './comparison-matrix.component.html',
    styleUrls: ['./rubric-builder.component.css'],
})
export class RubricComparisonMatrixComponent {
    @Input() Keys: string[] = [];
    @Input() Columns: MatrixColumn[] = [];

    public get Shown(): MatrixColumn[] {
        const labels: Record<string, string> = { Human: 'Human', AI: 'AI Evaluator', Self: 'Agent Self-Check' };
        return (['Human', 'AI', 'Self'] as const).map(type => this.Columns.find(column => column.evaluatorType === type) ?? {
            id: type,
            name: labels[type],
            evaluatorType: type,
            status: type === 'Self' ? 'Disabled' : 'Empty',
            scores: [] as { key: string; normalizedScore: number | null; rationale?: string }[],
        });
    }

    public ScoreText(column: MatrixColumn, key: string): string {
        const score = column.scores.find(item => item.key === key);
        if (!score || score.normalizedScore == null) return column.status === 'Disabled' ? 'Disabled' : 'No score yet';
        return String(score.normalizedScore);
    }

    public RationaleText(column: MatrixColumn, key: string): string {
        return column.scores.find(item => item.key === key)?.rationale || '';
    }

    public get Model(): MatrixModel {
        return ComparisonMatrix(this.Keys, this.Shown);
    }

    public Cell(row: { cells: { columnId: string; score: number | null }[] }, columnId: string): { columnId: string; score: number | null } | null {
        return row.cells.find(cell => cell.columnId === columnId) ?? null;
    }
}
