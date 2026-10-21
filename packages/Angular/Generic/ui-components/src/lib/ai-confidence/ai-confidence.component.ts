import { Component, EventEmitter, HostBinding, Input, NgModule, Output } from '@angular/core';

/**
 * Measurement scale of an AI confidence signal:
 * - `'probability'`: per-inference certainty in `[0, 1]`
 * - `'grade'`: model-level validation quality band (`'Excellent' | 'Good' | 'Fair' | 'Poor'`)
 * - `'ordinal'`: qualitative confidence band without a numeric score
 */
export type MJAIConfidenceScale = 'probability' | 'grade' | 'ordinal';

/**
 * Plain-language confidence band used for visual styling and non-technical user guidance.
 */
export type MJAIConfidenceBand = 'high' | 'medium' | 'low' | 'unknown';

/**
 * Structural contract consumed by `<mj-ai-confidence-badge>` and `<mj-ai-explanation-panel>`.
 *
 * Matches `AIConfidenceSignal` from `@memberjunction/ai-core-plus` structurally so
 * `@memberjunction/ng-ui-components` remains a pure L1 widget package with zero runtime
 * dependencies on server/AI packages.
 */
export interface MJAIConfidenceSignalData {
    scale: MJAIConfidenceScale;
    confidence: number | null;
    band: MJAIConfidenceBand;
    bandLabel: string;
    rawScale?: string | null;
    gradeDots?: number | null;
    recommendation?: string | null;
    reasoning: string;
    headline?: string | null;
    sourcePromptRunID?: string | null;
    sourceAgentRunID?: string | null;
    canAct?: boolean;
    gateReason?: string | null;
}

/**
 * Event payload emitted when a user clicks a provenance run link inside
 * `<mj-ai-explanation-panel>`. Host applications (such as MJ Explorer) handle
 * navigation via `NavigationService`.
 */
export interface MJAISourceRunEvent {
    runType: 'promptRun' | 'agentRun';
    runID: string;
}

/**
 * `<mj-ai-confidence-badge>` — Plain-language AI confidence and reliability pill.
 *
 * Ensures non-technical users never see a bare, unexplained percentage and never
 * confuses model-level validation grades (`scale === 'grade'`) with per-record
 * probability scores (`scale === 'probability'`).
 */
@Component({
    selector: 'mj-ai-confidence-badge',
    standalone: true,
    template: `
        <i [class]="IconClass" aria-hidden="true"></i>
        @if (FormattedScore) {
            <strong class="mj-ai-confidence-badge-score">{{ FormattedScore }}</strong>
        }
        @if (ShowGradeDots) {
            <span class="mj-ai-confidence-badge-dots" aria-hidden="true">
                @for (dot of DotIndices; track dot) {
                    <span
                        class="mj-ai-confidence-badge-dot"
                        [class.mj-ai-confidence-badge-dot--filled]="dot <= FilledDotCount"
                    ></span>
                }
            </span>
        }
        <span class="mj-ai-confidence-badge-label">{{ DisplayLabel }}</span>
    `,
    styles: [`
        :host {
            display: inline-flex;
            align-items: center;
            gap: var(--mj-space-1-5);
            padding: var(--mj-space-1) var(--mj-space-2-5);
            background: var(--mj-bg-surface-card);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-full);
            font-size: var(--mj-text-xs);
            color: var(--mj-text-secondary);
            white-space: nowrap;
            line-height: 1.4;
        }

        :host(.mj-ai-confidence-badge--compact) {
            padding: 2px var(--mj-space-2);
            gap: var(--mj-space-1);
        }

        .mj-ai-confidence-badge-score {
            font-weight: 600;
            color: inherit;
        }

        .mj-ai-confidence-badge-label {
            font-weight: 500;
        }

        .mj-ai-confidence-badge-dots {
            display: inline-flex;
            align-items: center;
            gap: 3px;
        }

        .mj-ai-confidence-badge-dot {
            width: 6px;
            height: 6px;
            border-radius: var(--mj-radius-full);
            background: var(--mj-border-default);
        }

        .mj-ai-confidence-badge-dot--filled {
            background: currentColor;
        }

        :host(.mj-ai-confidence-badge--high) {
            background: color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface));
            border-color: color-mix(in srgb, var(--mj-status-success) 30%, var(--mj-border-default));
            color: var(--mj-status-success);
        }

        :host(.mj-ai-confidence-badge--medium) {
            background: color-mix(in srgb, var(--mj-status-warning) 10%, var(--mj-bg-surface));
            border-color: color-mix(in srgb, var(--mj-status-warning) 30%, var(--mj-border-default));
            color: var(--mj-status-warning);
        }

        :host(.mj-ai-confidence-badge--low) {
            background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
            border-color: color-mix(in srgb, var(--mj-status-error) 30%, var(--mj-border-default));
            color: var(--mj-status-error);
        }

        :host(.mj-ai-confidence-badge--unknown) {
            background: var(--mj-bg-surface-sunken);
            border-color: var(--mj-border-subtle);
            color: var(--mj-text-muted);
        }
    `]
})
export class MJAIConfidenceBadgeComponent {
    /** Standardized confidence signal to render. */
    @Input() Signal: MJAIConfidenceSignalData | null = null;

    /** Whether to display the formatted percentage when `scale === 'probability'`. */
    @Input() ShowNumeric = true;

    /** Renders a tighter pill suitable for dense table rows or tag chips. */
    @Input() Compact = false;

    public readonly DotIndices: readonly number[] = [1, 2, 3, 4, 5];

    public get Band(): MJAIConfidenceBand {
        return this.Signal?.band ?? 'unknown';
    }

    @HostBinding('class.mj-ai-confidence-badge--high')
    public get IsHigh(): boolean {
        return this.Band === 'high';
    }

    @HostBinding('class.mj-ai-confidence-badge--medium')
    public get IsMedium(): boolean {
        return this.Band === 'medium';
    }

    @HostBinding('class.mj-ai-confidence-badge--low')
    public get IsLow(): boolean {
        return this.Band === 'low';
    }

    @HostBinding('class.mj-ai-confidence-badge--unknown')
    public get IsUnknown(): boolean {
        return this.Band === 'unknown';
    }

    @HostBinding('class.mj-ai-confidence-badge--compact')
    public get IsCompact(): boolean {
        return this.Compact;
    }

    @HostBinding('attr.role')
    public readonly Role = 'status';

    @HostBinding('attr.aria-label')
    public get AriaLabel(): string {
        const scorePart = this.FormattedScore ? `${this.FormattedScore} — ` : '';
        return `${scorePart}${this.DisplayLabel}`;
    }

    public get FormattedScore(): string | null {
        if (!this.ShowNumeric || !this.Signal || this.Signal.scale !== 'probability') {
            return null;
        }
        if (this.Signal.confidence == null || !Number.isFinite(this.Signal.confidence)) {
            return null;
        }
        const pct = Math.round(Math.min(1, Math.max(0, this.Signal.confidence)) * 100);
        return `${pct}%`;
    }

    public get ShowGradeDots(): boolean {
        return (
            this.Signal?.scale === 'grade' &&
            this.Signal.gradeDots != null &&
            this.Signal.gradeDots > 0
        );
    }

    public get FilledDotCount(): number {
        const raw = this.Signal?.gradeDots ?? 0;
        return Math.min(5, Math.max(0, Math.round(raw)));
    }

    public get DisplayLabel(): string {
        if (!this.Signal) {
            return 'Confidence unavailable — review recommended';
        }
        return this.Signal.bandLabel || 'Confidence unavailable — review recommended';
    }

    public get IconClass(): string {
        switch (this.Band) {
            case 'high':
                return 'fa-solid fa-circle-check';
            case 'medium':
                return 'fa-solid fa-circle-exclamation';
            case 'low':
                return 'fa-solid fa-triangle-exclamation';
            default:
                return 'fa-solid fa-circle-question';
        }
    }
}

/**
 * `<mj-ai-explanation-panel>` — Expandable plain-language rationale and provenance
 * disclosure card for AI recommendations, tags, duplicate verdicts, and model grades.
 */
@Component({
    selector: 'mj-ai-explanation-panel',
    standalone: true,
    imports: [MJAIConfidenceBadgeComponent],
    template: `
        <div
            class="mj-ai-explanation-header"
            role="button"
            tabindex="0"
            [attr.aria-expanded]="Expanded"
            (click)="Toggle()"
            (keydown)="OnToggleKeydown($event)"
        >
            <div class="mj-ai-explanation-header-main">
                <i
                    class="fa-solid mj-ai-explanation-chevron"
                    [class.fa-chevron-right]="!Expanded"
                    [class.fa-chevron-down]="Expanded"
                    aria-hidden="true"
                ></i>
                <span class="mj-ai-explanation-title">{{ Title }}</span>
                @if (Signal?.recommendation) {
                    <span class="mj-ai-explanation-rec-chip">{{ Signal?.recommendation }}</span>
                }
            </div>
            <mj-ai-confidence-badge [Signal]="Signal" [Compact]="true" />
        </div>

        @if (Expanded && Signal) {
            <div class="mj-ai-explanation-body">
                @if (Signal.headline) {
                    <p class="mj-ai-explanation-headline">{{ Signal.headline }}</p>
                }
                <p class="mj-ai-explanation-reasoning">{{ Signal.reasoning }}</p>

                @if (Signal.canAct === false && Signal.gateReason) {
                    <div class="mj-ai-explanation-gate-banner" role="alert">
                        <i class="fa-solid fa-lock" aria-hidden="true"></i>
                        <span>{{ Signal.gateReason }}</span>
                    </div>
                }

                @if (HasProvenance) {
                    <div class="mj-ai-explanation-provenance">
                        <span class="mj-ai-explanation-provenance-label">Audit Trace:</span>
                        @if (Signal.sourceAgentRunID) {
                            <button
                                type="button"
                                class="mj-ai-explanation-trace-link"
                                (click)="EmitSourceRun('agentRun', Signal.sourceAgentRunID, $event)"
                            >
                                <i class="fa-solid fa-robot" aria-hidden="true"></i>
                                Agent Run
                            </button>
                        }
                        @if (Signal.sourcePromptRunID) {
                            <button
                                type="button"
                                class="mj-ai-explanation-trace-link"
                                (click)="EmitSourceRun('promptRun', Signal.sourcePromptRunID, $event)"
                            >
                                <i class="fa-solid fa-terminal" aria-hidden="true"></i>
                                Prompt Run
                            </button>
                        }
                    </div>
                }
            </div>
        }
    `,
    styles: [`
        :host {
            display: block;
            background: var(--mj-bg-surface-card);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-md);
            overflow: hidden;
        }

        .mj-ai-explanation-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--mj-space-3);
            padding: var(--mj-space-2-5) var(--mj-space-3);
            cursor: pointer;
            user-select: none;
            background: var(--mj-bg-surface);
        }

        .mj-ai-explanation-header:hover {
            background: var(--mj-bg-surface-hover);
        }

        .mj-ai-explanation-header:focus-visible {
            outline: 2px solid var(--mj-border-focus);
            outline-offset: -2px;
        }

        .mj-ai-explanation-header-main {
            display: flex;
            align-items: center;
            gap: var(--mj-space-2);
            min-width: 0;
        }

        .mj-ai-explanation-chevron {
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
            width: 12px;
        }

        .mj-ai-explanation-title {
            font-size: var(--mj-text-sm);
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .mj-ai-explanation-rec-chip {
            padding: 2px var(--mj-space-2);
            border-radius: var(--mj-radius-sm);
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-subtle);
            font-size: var(--mj-text-xs);
            font-weight: 500;
            color: var(--mj-text-secondary);
        }

        .mj-ai-explanation-body {
            padding: var(--mj-space-3);
            border-top: 1px solid var(--mj-border-subtle);
            display: flex;
            flex-direction: column;
            gap: var(--mj-space-2-5);
            font-size: var(--mj-text-sm);
            color: var(--mj-text-secondary);
        }

        .mj-ai-explanation-headline {
            margin: 0;
            font-weight: 600;
            color: var(--mj-text-primary);
        }

        .mj-ai-explanation-reasoning {
            margin: 0;
            line-height: 1.5;
            white-space: pre-line;
        }

        .mj-ai-explanation-gate-banner {
            display: flex;
            align-items: center;
            gap: var(--mj-space-2);
            padding: var(--mj-space-2) var(--mj-space-2-5);
            border-radius: var(--mj-radius-sm);
            background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
            border: 1px solid color-mix(in srgb, var(--mj-status-error) 30%, var(--mj-border-default));
            color: var(--mj-status-error);
            font-size: var(--mj-text-xs);
            font-weight: 500;
        }

        .mj-ai-explanation-provenance {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: var(--mj-space-2);
            padding-top: var(--mj-space-1);
            font-size: var(--mj-text-xs);
            color: var(--mj-text-muted);
        }

        .mj-ai-explanation-provenance-label {
            font-weight: 500;
        }

        .mj-ai-explanation-trace-link {
            display: inline-flex;
            align-items: center;
            gap: var(--mj-space-1);
            padding: 2px var(--mj-space-2);
            border-radius: var(--mj-radius-sm);
            border: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface);
            color: var(--mj-brand-primary);
            font-size: var(--mj-text-xs);
            font-weight: 500;
            cursor: pointer;
        }

        .mj-ai-explanation-trace-link:hover {
            background: var(--mj-bg-surface-hover);
        }
    `]
})
export class MJAIExplanationPanelComponent {
    /** Standardized confidence and rationale signal to render. */
    @Input() Signal: MJAIConfidenceSignalData | null = null;

    /** Summary header title displayed next to the confidence badge. */
    @Input() Title = 'Why this AI recommendation?';

    /** Whether the rationale body is expanded. */
    @Input() Expanded = false;

    /** Emits when the user toggles the disclosure panel open or closed. */
    @Output() ExpandedChange = new EventEmitter<boolean>();

    /**
     * Emits when the user clicks an Agent Run or Prompt Run provenance button.
     * Host shells handle navigation to the corresponding run detail view.
     */
    @Output() OpenSourceRun = new EventEmitter<MJAISourceRunEvent>();

    public get HasProvenance(): boolean {
        return Boolean(this.Signal?.sourceAgentRunID || this.Signal?.sourcePromptRunID);
    }

    public Toggle(): void {
        this.Expanded = !this.Expanded;
        this.ExpandedChange.emit(this.Expanded);
    }

    public OnToggleKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.Toggle();
        }
    }

    public EmitSourceRun(
        runType: 'promptRun' | 'agentRun',
        runID: string | null | undefined,
        event?: Event
    ): void {
        event?.stopPropagation();
        if (!runID) {
            return;
        }
        this.OpenSourceRun.emit({ runType, runID });
    }
}

/**
 * Convenience NgModule exporting both `<mj-ai-confidence-badge>` and
 * `<mj-ai-explanation-panel>` for NgModule-based feature modules.
 */
@NgModule({
    imports: [MJAIConfidenceBadgeComponent, MJAIExplanationPanelComponent],
    exports: [MJAIConfidenceBadgeComponent, MJAIExplanationPanelComponent],
})
export class MJAIConfidenceModule {}
