import { ChangeDetectorRef, Directive, HostBinding, inject, Input, OnDestroy } from '@angular/core';
import { ChartValueFormatter, DefaultValueFormatter } from '../chart.types';
import { ChartController } from './chart-controller';
import { ActivePoint, ChartFrameKey } from './geometry.types';
import { DefaultChartHeight, ResolveAspectRatioInput, ResolveHeightInput } from './inputs';
import { ChartContext } from './prepare-helpers';
import { LocalPoint, PointerKindOf } from './pointer';

/**
 * What the three charts share: the sizing/labelling inputs, the pointer/keyboard plumbing into the
 * ChartController, and teardown. A chart supplies its Controller, its kind (for log lines) and how
 * an activated point becomes its own click event. Not exported from public-api.ts.
 */
@Directive()
export abstract class MJBaseChartComponent<TGeometry> implements OnDestroy {
    protected readonly cdr = inject(ChangeDetectorRef);
    protected formatter: ChartValueFormatter = DefaultValueFormatter;
    protected ariaLabel = '';
    private height: number | 'fill' = DefaultChartHeight;
    private aspectRatio: number | null = null;

    public abstract readonly Controller: ChartController<TGeometry>;
    /** e.g. 'bar' — the start of every log line this chart writes. */
    protected abstract readonly ChartKind: string;
    /** Emit the chart's click event for an activated point (mouse click, second touch tap, Enter/Space). */
    protected abstract EmitPoint(point: ActivePoint): void;

    // Height and AspectRatio skip MarkDirty on purpose: they don't change the controller's view, so the template/frame react to the input change directly.
    /** A px height (minimum 120; clamped and logged), or `'fill'` to take the parent's height. `undefined`/`null` (an unset binding) means 300 and is not a caller mistake. */
    @Input() set Height(value: number | 'fill' | null | undefined) { this.height = ResolveHeightInput(value, this.Controller.Log, this.Context()); }
    get Height(): number | 'fill' { return this.height; }

    /** Width ÷ height (e.g. `16 / 9`); wins over `Height`. `undefined`/`null` is off; invalid values are logged and ignored, finite ones clamped to [0.25, 8]. */
    @Input() set AspectRatio(value: number | null | undefined) { this.aspectRatio = ResolveAspectRatioInput(value, this.Controller.Log, this.Context()); }
    get AspectRatio(): number | null { return this.aspectRatio; }

    @Input() set ValueFormatter(value: ChartValueFormatter) { this.formatter = value ?? DefaultValueFormatter; this.Controller.MarkDirty(); }
    get ValueFormatter(): ChartValueFormatter { return this.formatter; }

    @Input() set AriaLabel(value: string) { this.ariaLabel = value ?? ''; this.Controller.MarkDirty(); }
    get AriaLabel(): string { return this.ariaLabel; }

    @Input() ShowLegend = true;
    @Input() ShowTooltip = true;
    @Input() EmptyMessage = 'No data';

    protected get HeightValue(): number | 'fill' { return this.height; }
    protected get AspectRatioValue(): number | null { return this.aspectRatio; }

    /** Lets the host fill its parent (the frame measures that height); see Height. */
    @HostBinding('class.mj-chart-fill') protected get FillsParent(): boolean { return this.height === 'fill'; }
    public get AriaLabelText(): string { return this.ariaLabel || 'Chart'; }

    public OnPointerMove(event: PointerEvent): void {
        // Ignore touch moves so a scroll or drag gesture neither moves nor dismisses the value the first tap showed
        // (a miss goes through Leave(), which would also clear the armed point). Otherwise the second tap's target
        // would be ambiguous: it could emit a value the user is no longer looking at.
        if (PointerKindOf(event) === 'touch') {
            return;
        }
        const p = LocalPoint(event);
        this.Controller.PointerMove(p.X, p.Y);
    }

    public OnPointerLeave(event: PointerEvent): void {
        this.Controller.PointerLeave(PointerKindOf(event));
    }

    public OnPointerUp(event: PointerEvent): void {
        const p = LocalPoint(event);
        this.emitIfAny(this.Controller.PointerUp(p.X, p.Y, PointerKindOf(event)));
    }

    public OnClick(event: MouseEvent): void {
        const p = LocalPoint(event);
        this.emitIfAny(this.Controller.Click(p.X, p.Y));
    }

    public OnKeyCommand(key: ChartFrameKey): void {
        this.emitIfAny(this.Controller.Key(key));
    }

    public ngOnDestroy(): void {
        this.Controller.Destroy();
    }

    /** e.g. `bar chart "Revenue"` — prefixes every log line. */
    protected Context(): string {
        return ChartContext(this.ChartKind, this.ariaLabel);
    }

    private emitIfAny(point: ActivePoint | null): void {
        if (point !== null) {
            this.EmitPoint(point);
        }
    }
}
