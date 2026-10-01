import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { addCriterion, draftProblems, previewScore, setWeight, weightShares, type RubricFormAnswer } from './model.js';

/**
 * Draft author. Edits the tree the host passes in and emits the new tree.
 * It does not save or publish. Share percents and the preview use the same
 * scoring function as submit.
 */
@Component({
    standalone: true,
    selector: 'mj-rubric-builder',
    imports: [CommonModule],
    templateUrl: './rubric-builder.component.html',
    styleUrls: ['./rubric-builder.component.css'],
})
export class RubricBuilderComponent implements OnChanges {
    @Input() Nodes: RubricNodeSnapshot[] = [];
    @Input() Scales: RubricScaleSnapshot[] = [];
    @Input() Version: RubricVersionSnapshot | null = null;
    @Input() SampleAnswers: RubricFormAnswer[] = [];
    @Output() NodesChange = new EventEmitter<RubricNodeSnapshot[]>();

    public Shares = new Map<string, number>();
    public Problems: string[] = [];
    public Preview: RubricScoreResult | null = null;

    ngOnChanges(): void {
        this.Shares = weightShares(this.Nodes);
        this.Problems = draftProblems(this.Nodes, this.Scales);
        this.Preview = this.Version ? previewScore({ ...this.Version, nodes: this.Nodes, scales: this.Scales }, this.SampleAnswers) : null;
    }

    public Share(id: string): number {
        return Math.round(this.Shares.get(id) ?? 0);
    }

    public OnAdd(): void {
        this.NodesChange.emit(addCriterion(this.Nodes, 'New criterion', this.Scales[0]?.id ?? null));
    }

    public OnWeight(node: RubricNodeSnapshot, event: Event): void {
        const value = Number((event.target as HTMLInputElement).value);
        this.NodesChange.emit(setWeight(this.Nodes, node.id, value));
    }
}
