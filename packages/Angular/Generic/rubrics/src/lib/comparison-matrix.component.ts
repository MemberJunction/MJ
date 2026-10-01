import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { comparisonMatrix, type MatrixColumn, type MatrixModel } from './model.js';

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

    public get Model(): MatrixModel {
        return comparisonMatrix(this.Keys, this.Columns);
    }
}
