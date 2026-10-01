import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { NotApplicablePolicy, RubricBandSnapshot } from '@memberjunction/rubrics-base';
import { addBand, addNode, draftProblems, moveNode, moveProblem, previewScore, setAnchor, setGate, setPolicy, setScale, setWeight, updateBand, weightShares, type RubricFormAnswer } from './model.js';

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
    @Input() Bands: RubricBandSnapshot[] = [];
    @Input() Version: RubricVersionSnapshot | null = null;
    @Input() SampleAnswers: RubricFormAnswer[] = [];
    @Output() NodesChange = new EventEmitter<RubricNodeSnapshot[]>();
    @Output() BandsChange = new EventEmitter<RubricBandSnapshot[]>();

    public Shares = new Map<string, number>();
    public Problems: string[] = [];
    public MoveProblem: string | null = null;
    public Preview: RubricScoreResult | null = null;

    ngOnChanges(): void {
        this.Shares = weightShares(this.Nodes);
        this.Problems = draftProblems(this.Nodes, this.Scales);
        this.Preview = this.Version ? previewScore({ ...this.Version, nodes: this.Nodes, scales: this.Scales }, this.SampleAnswers) : null;
    }

    public Share(id: string): number {
        return Math.round(this.Shares.get(id) ?? 0);
    }

    public Parents(node: RubricNodeSnapshot): RubricNodeSnapshot[] {
        return this.Nodes.filter(item => item.nodeType === 'Group' && item.id !== node.id && !moveProblem(this.Nodes, node.id, item.id));
    }

    public Levels(node: RubricNodeSnapshot): { id: string; label: string }[] {
        return this.Scales.find(scale => scale.id === node.scaleId)?.levels ?? [];
    }

    public Anchor(node: RubricNodeSnapshot, levelId: string): string {
        return node.anchors?.find(anchor => anchor.scaleLevelId === levelId)?.descriptor ?? '';
    }

    public OnAdd(kind: 'Group' | 'Criterion'): void {
        this.NodesChange.emit(addNode(this.Nodes, kind === 'Group' ? 'New group' : 'New criterion', kind, this.Scales[0]?.id ?? null, null));
    }

    public OnWeight(node: RubricNodeSnapshot, event: Event): void {
        this.NodesChange.emit(setWeight(this.Nodes, node.id, Number((event.target as HTMLInputElement).value)));
    }

    public OnParent(node: RubricNodeSnapshot, event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        const parentId = value === '' ? null : value;
        const problem = moveProblem(this.Nodes, node.id, parentId);
        this.MoveProblem = problem;
        if (!problem) this.NodesChange.emit(moveNode(this.Nodes, node.id, parentId));
    }

    public OnScale(node: RubricNodeSnapshot, event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        this.NodesChange.emit(setScale(this.Nodes, node.id, value === '' ? null : value));
    }

    public OnAnchor(node: RubricNodeSnapshot, levelId: string, event: Event): void {
        this.NodesChange.emit(setAnchor(this.Nodes, node.id, levelId, (event.target as HTMLInputElement).value));
    }

    public OnGate(node: RubricNodeSnapshot, event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        this.NodesChange.emit(setGate(this.Nodes, node.id, checked, checked ? node.gateMinimumScore ?? 0.6 : null));
    }

    public OnMinimum(node: RubricNodeSnapshot, event: Event): void {
        this.NodesChange.emit(setGate(this.Nodes, node.id, true, Number((event.target as HTMLInputElement).value)));
    }

    public OnPolicy(node: RubricNodeSnapshot, event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        this.NodesChange.emit(setPolicy(this.Nodes, node.id, value === '' ? null : value as NotApplicablePolicy));
    }

    public OnAddBand(): void {
        this.BandsChange.emit(addBand(this.Bands, 'New band'));
    }

    public OnBand(id: string, field: 'label' | 'minScore' | 'maxScore', event: Event): void {
        const raw = (event.target as HTMLInputElement).value;
        const patch = field === 'label' ? { label: raw } : { [field]: Number(raw) };
        this.BandsChange.emit(updateBand(this.Bands, id, patch));
    }
}
