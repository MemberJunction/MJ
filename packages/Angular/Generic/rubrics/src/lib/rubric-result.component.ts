import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RubricScoreResult, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { bandFor, displayScore, type RubricFormAnswer } from './model.js';

/** Read-only result. The score is on the version's display range, with the band and each criterion. */
@Component({
    standalone: true,
    selector: 'mj-rubric-result',
    imports: [CommonModule],
    templateUrl: './rubric-result.component.html',
    styleUrls: ['./rubric-result.component.css', './rubric-builder.component.css'],
})
export class RubricResultComponent {
    @Input() Version: RubricVersionSnapshot | null = null;
    @Input() Result: RubricScoreResult | null = null;
    /** The host's saved answers, shown next to each bar. */
    @Input() Answers: RubricFormAnswer[] = [];

    public get Shown(): number | null {
        if (!this.Version || !this.Result) return null;
        return displayScore(this.Result.normalizedScore, this.Version.scoreDisplayMin, this.Version.scoreDisplayMax);
    }

    public get BandLabel(): string | null {
        return bandFor(this.Result?.normalizedScore ?? null, this.Version?.bands ?? [])?.label ?? null;
    }

    public Note(id: string, field: 'rationale' | 'evidence'): string {
        return this.Answers.find(item => item.criterionId === id)?.[field] ?? '';
    }

    public Bar(score: number | null): number {
        if (score === null) return 0;
        return Math.round(score * 100);
    }

    public NodeName(id: string): string {
        const node = this.Version?.nodes.find(item => item.id === id || item.key === id);
        return node?.name || id;
    }

    public Weight(id: string): string {
        const node = this.Version?.nodes.find(item => item.id === id || item.key === id);
        return node ? String(node.weight) : '';
    }

    public Gate(id: string): string {
        const node = this.Version?.nodes.find(item => item.id === id || item.key === id);
        if (!node?.isGate) return 'off';
        return `≥ ${node.gateMinimumScore ?? ''}`;
    }

    public ScaleName(id: string): string {
        const node = this.Version?.nodes.find(item => item.id === id || item.key === id);
        return this.Version?.scales.find(scale => scale.id === node?.scaleId)?.name ?? '';
    }
}
