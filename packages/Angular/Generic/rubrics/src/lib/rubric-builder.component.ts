import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RubricNodeSnapshot, RubricScaleSnapshot, RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import type { NotApplicablePolicy, RubricBandSnapshot } from '@memberjunction/rubrics-base';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { AddBand, AddNode, DraftProblems, MoveNode, MoveProblem, PatchNode, PreviewScore, RemoveBand, RemoveNode, SampleMatchesTree, SetAnchor, SetGate, SetPolicy, SetScale, SetWeight, UpdateBand, WeightShares, type RubricFormAnswer } from './model.js';

/**
 * Draft author. Edits the tree the host passes in and emits the new tree.
 * It does not save or publish. Share percents and the preview use the same
 * scoring function as submit.
 */
@Component({
    standalone: true,
    selector: 'mj-rubric-builder',
    imports: [CommonModule, MJButtonDirective],
    templateUrl: './rubric-builder.component.html',
    styleUrls: ['./rubric-builder.component.css'],
})
export class RubricBuilderComponent implements OnChanges {
    @Input() Nodes: RubricNodeSnapshot[] = [];
    @Input() Scales: RubricScaleSnapshot[] = [];
    @Input() Bands: RubricBandSnapshot[] = [];
    @Input() Version: RubricVersionSnapshot | null = null;
    @Input() SampleAnswers: RubricFormAnswer[] = [];
    @Input() BaseBands: RubricBandSnapshot[] = [];
    @Input() ReadOnly = false;
    @Input() Name = '';
    @Input() PublishedLabel = '';
    @Input() NextVersion = '';
    @Input() ComputedBump: string | null = null;
    @Input() Viewing: 'draft' | 'published' = 'draft';
    @Output() ViewingChange = new EventEmitter<'draft' | 'published'>();
    @Output() NodesChange = new EventEmitter<RubricNodeSnapshot[]>();
    @Output() BandsChange = new EventEmitter<RubricBandSnapshot[]>();

    public Shares = new Map<string, number>();
    public Problems: string[] = [];
    public MoveProblem: string | null = null;
    public Preview: RubricScoreResult | null = null;

    ngOnChanges(): void {
        this.Shares = WeightShares(this.Nodes);
        this.Problems = DraftProblems(this.Nodes, this.Scales);
        if (!SampleMatchesTree(this.Nodes, this.SampleAnswers) && this.Nodes.some(node => node.nodeType === 'Criterion' && node.scaleId)) {
            this.SampleAnswers = this.sample(true);
        }
        this.Preview = this.Version ? PreviewScore({ ...this.Version, nodes: this.Nodes, scales: this.Scales }, this.SampleAnswers) : null;
        this.selectLoadedScales();
    }

    /** The select's value is applied before its options exist, so re-apply after render. */
    private selectLoadedScales(): void {
        queueMicrotask(() => {
            const selects = Array.from(document.querySelectorAll('mj-rubric-builder select')).map(element => element as HTMLSelectElement).filter(select =>
                Array.from(select.options).some(option => this.Scales.some(scale => option.value.toLowerCase() === scale.id.toLowerCase())));
            const criteria = this.Nodes.filter(node => node.nodeType === 'Criterion');
            selects.forEach((select, index) => {
                const scaleId = criteria[index]?.scaleId;
                if (!scaleId) return;
                const match = Array.from(select.options).find(option => option.value.toLowerCase() === scaleId.toLowerCase());
                if (match) select.value = match.value;
            });
        });
    }

    public Share(id: string): number {
        return Math.round(this.Shares.get(id) ?? 0);
    }

    public Parents(node: RubricNodeSnapshot): RubricNodeSnapshot[] {
        return this.Nodes.filter(item => item.nodeType === 'Group' && item.id !== node.id && !MoveProblem(this.Nodes, node.id, item.id));
    }

    public get Removed(): RubricBandSnapshot[] {
        const labels = new Set(this.Bands.map(band => band.label));
        return this.BaseBands.filter(band => !labels.has(band.label));
    }

    public ScaleLabel(node: RubricNodeSnapshot): string {
        return this.Scales.find(scale => scale.id.toLowerCase() === (node.scaleId ?? '').toLowerCase())?.name || 'No scale';
    }

    public Simulate(meets: boolean): void {
        this.SampleAnswers = this.sample(meets);
        this.ngOnChanges();
    }

    private sample(meets: boolean): RubricFormAnswer[] {
        return this.Nodes.filter(node => node.nodeType === 'Criterion').map(node => {
            const levels = [...(this.Scales.find(scale => scale.id.toLowerCase() === (node.scaleId ?? '').toLowerCase())?.levels ?? [])].sort((a, b) => a.normalizedValue - b.normalizedValue);
            const level = meets ? levels[levels.length - 1] : levels[0];
            return { criterionId: node.id, scaleLevelId: level?.id ?? null };
        });
    }

    public Levels(node: RubricNodeSnapshot): { id: string; label: string }[] {
        return this.Scales.find(scale => scale.id === node.scaleId)?.levels ?? [];
    }

    public Anchor(node: RubricNodeSnapshot, levelId: string): string {
        return node.anchors?.find(anchor => anchor.scaleLevelId === levelId)?.descriptor ?? '';
    }

    public OnAdd(kind: 'Group' | 'Criterion'): void {
        this.NodesChange.emit(AddNode(this.Nodes, kind === 'Group' ? 'New group' : 'New criterion', kind, this.Scales[0]?.id ?? null, null));
    }

    public OnWeight(node: RubricNodeSnapshot, event: Event): void {
        this.NodesChange.emit(SetWeight(this.Nodes, node.id, Number((event.target as HTMLInputElement).value)));
    }

    public OnParent(node: RubricNodeSnapshot, event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        const parentId = value === '' ? null : value;
        const problem = MoveProblem(this.Nodes, node.id, parentId);
        this.MoveProblem = problem;
        if (!problem) this.NodesChange.emit(MoveNode(this.Nodes, node.id, parentId));
    }

    public OnScale(node: RubricNodeSnapshot, event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        this.NodesChange.emit(SetScale(this.Nodes, node.id, value === '' ? null : value));
    }

    public OnAnchor(node: RubricNodeSnapshot, levelId: string, event: Event): void {
        this.NodesChange.emit(SetAnchor(this.Nodes, node.id, levelId, (event.target as HTMLInputElement).value));
    }

    public OnGate(node: RubricNodeSnapshot, event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        this.NodesChange.emit(SetGate(this.Nodes, node.id, checked, checked ? node.gateMinimumScore ?? 0.6 : null));
    }

    public OnMinimum(node: RubricNodeSnapshot, event: Event): void {
        this.NodesChange.emit(SetGate(this.Nodes, node.id, true, Number((event.target as HTMLInputElement).value)));
    }

    public OnPolicy(node: RubricNodeSnapshot, event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        this.NodesChange.emit(SetPolicy(this.Nodes, node.id, value === '' ? null : value as NotApplicablePolicy));
    }

    public OnText(node: RubricNodeSnapshot, field: 'name' | 'key' | 'description' | 'guidance', event: Event): void {
        const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
        this.NodesChange.emit(PatchNode(this.Nodes, node.id, { [field]: value }));
    }

    public OnNodeType(node: RubricNodeSnapshot, event: Event): void {
        const nodeType = (event.target as HTMLSelectElement).value === 'Group' ? 'Group' : 'Criterion';
        this.NodesChange.emit(PatchNode(this.Nodes, node.id, { nodeType }));
    }

    public OnRollup(node: RubricNodeSnapshot, event: Event): void {
        const value = (event.target as HTMLSelectElement).value;
        this.NodesChange.emit(PatchNode(this.Nodes, node.id, { rollupMethod: value === '' ? null : value as RubricNodeSnapshot['rollupMethod'] }));
    }

    public OnFlag(node: RubricNodeSnapshot, field: 'isAdvisory' | 'evidenceRequired' | 'rationaleRequired', event: Event): void {
        this.NodesChange.emit(PatchNode(this.Nodes, node.id, { [field]: (event.target as HTMLInputElement).checked }));
    }

    public OnDeleteNode(node: RubricNodeSnapshot): void {
        this.NodesChange.emit(RemoveNode(this.Nodes, node.id));
    }

    public OnDeleteBand(id: string): void {
        this.BandsChange.emit(RemoveBand(this.Bands, id));
    }

    public OnAddBand(): void {
        this.BandsChange.emit(AddBand(this.Bands, 'New band'));
    }

    public OnBand(id: string, field: 'label' | 'minScore' | 'maxScore' | 'displayTone' | 'sequence', event: Event): void {
        const raw = (event.target as HTMLInputElement | HTMLSelectElement).value;
        const patch = field === 'label' || field === 'displayTone' ? { [field]: raw } : { [field]: Number(raw) };
        this.BandsChange.emit(UpdateBand(this.Bands, id, patch));
    }
}
