import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostBinding, inject, Input, OnDestroy, Output } from '@angular/core';
import { ChartSliceEvent, ChartValueFormatter, DefaultValueFormatter, DonutSlice } from '../chart.types';
import { MJChartFrameComponent } from '../internal/chart-frame.component';
import { ChartController, ChartPreparation } from '../internal/chart-controller';
import { ActivePoint, ChartFrameKey, DonutArc, DonutGeometry } from '../internal/geometry.types';
import { ChartIssueLog } from '../internal/issue-log';
import { ClampInput, DefaultChartHeight, ResolveAspectRatioInput, ResolveHeightInput } from '../internal/inputs';
import { ChartContext, LogMissingAriaLabel, LogSoftCap, ResolveFills } from '../internal/prepare-helpers';
import { IsFiniteValue, ValidateSlices } from '../internal/validate';
import { ComputeDonutLayout, ComputeSlicePercents } from '../internal/donut-layout';
import { DonutAnchor, DonutPoints, HitTestDonut, NavigateList } from '../internal/hit-test';
import { BuildSliceTable, BuildSliceTooltip, DescribeSlice } from '../internal/describe';
import { FormatPercent, TypeMetrics } from '../internal/scales';
import { LocalPoint, PointerKindOf } from '../internal/pointer';

export const DonutSoftCaps = { Slices: 50 } as const;

const DefaultInnerRadiusRatio = 0.7;
const MaxInnerRadiusRatio = 0.85;

/**
 * Donut (or pie, with InnerRadiusRatio 0) chart with an optional center label/value
 * and percent labels drawn on the surface outside the ring.
 *
 * @example
 * <mj-donut-chart AriaLabel="Band distribution" [Slices]="bands" CenterLabel="Scored"
 *     [CenterValue]="total" [ShowPercentLabels]="true"></mj-donut-chart>
 */
@Component({
    selector: 'mj-donut-chart',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MJChartFrameComponent],
    styleUrls: ['../internal/chart-svg.css'],
    template: `
        @let view = Controller.View;
        @let pointer = Controller.Pointer;
        <mj-chart-frame
            [Height]="HeightValue" [AspectRatio]="AspectRatioValue" [AriaLabel]="AriaLabelText" [Status]="view.Status" [EmptyMessage]="EmptyMessage"
            [ShowLegend]="ShowLegend" [Legend]="view.Legend" [Table]="view.Table"
            [Announcement]="pointer.KeyboardActive ? (pointer.Description?.Announcement ?? '') : ''"
            [Tooltip]="ShowTooltip && pointer.TooltipOpen ? (pointer.Description?.Tooltip ?? null) : null"
            [TooltipAnchor]="pointer.Description?.Anchor ?? null"
            (SurfaceChange)="Controller.SetSurface($event)"
            (KeyCommand)="OnKeyCommand($event)"
            (FocusChange)="Controller.FocusChange($event)"
            (TooltipHoverChange)="Controller.TooltipHover($event)">
            @if (view.Geometry; as g) {
                <svg class="mj-chart-svg" aria-hidden="true" [attr.width]="g.Size.Width" [attr.height]="g.Size.Height"
                    (pointermove)="OnPointerMove($event)" (pointerleave)="OnPointerLeave($event)"
                    (pointerup)="OnPointerUp($event)" (click)="OnClick($event)">
                    <g [attr.transform]="'translate(' + g.CenterX + ',' + g.CenterY + ')'">
                        @for (arc of g.Arcs; track arc.SliceIndex) {
                            <path class="mj-chart-mark" [attr.d]="arc.Path" [style.fill]="arc.Fill"
                                [class.mj-chart-mark-inactive]="pointer.Active !== null && pointer.Active.CategoryIndex !== arc.SliceIndex" />
                        }
                        @if (pointer.KeyboardActive && pointer.Active; as active) {
                            @if (FocusArc(g, active); as arc) {
                                <path class="mj-chart-focus" [attr.d]="arc.Path" />
                            }
                        }
                    </g>
                    @let offsets = CenterOffsets(g);
                    @if (CenterLabel) {
                        <text class="mj-chart-center-label" [attr.x]="g.CenterX" [attr.y]="g.CenterY - (CenterValue ? offsets.Label : 0)" text-anchor="middle" dominant-baseline="middle">{{ CenterLabel }}</text>
                    }
                    @if (CenterValue) {
                        <text class="mj-chart-center-value" [attr.x]="g.CenterX" [attr.y]="g.CenterY + (CenterLabel ? offsets.Value : 0)" text-anchor="middle" dominant-baseline="middle">{{ CenterValue }}</text>
                    }
                    @for (arc of g.Arcs; track arc.SliceIndex) {
                        @if (arc.LabelPoint; as at) {
                            <text class="mj-chart-percent-label" [attr.x]="at.X" [attr.y]="at.Y" [attr.text-anchor]="at.Anchor" dominant-baseline="middle">{{ PercentText(arc) }}</text>
                        }
                    }
                </svg>
            }
        </mj-chart-frame>
    `,
})
export class MJDonutChartComponent implements OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private slices: ReadonlyArray<DonutSlice> = [];
    private innerRadiusRatio = DefaultInnerRadiusRatio;
    private showPercentLabels = false;
    private height: number | 'fill' = DefaultChartHeight;
    private aspectRatio: number | null = null;
    private formatter: ChartValueFormatter = DefaultValueFormatter;
    private ariaLabel = '';
    private fills: string[] = [];
    private percents: Array<number | null> = [];

    public readonly Controller: ChartController<DonutGeometry> = new ChartController<DonutGeometry>({
        Context: () => this.context(),
        Prepare: (log) => this.prepare(log),
        Table: () => BuildSliceTable(this.AriaLabelText, this.slices, this.formatter, this.percents),
        Layout: (surface) => ComputeDonutLayout({
            Slices: this.slices, Fills: this.fills, InnerRadiusRatio: this.innerRadiusRatio,
            ShowPercentLabels: this.showPercentLabels, Size: surface.Size, Measure: surface.Measure, Type: TypeMetrics(surface.FontSize),
        }),
        Points: (g) => DonutPoints(g),
        HitTest: (g, x, y) => HitTestDonut(g, x, y),
        Navigate: (points, current, key) => NavigateList(points, current, key),
        Describe: (g, p) => ({
            Tooltip: BuildSliceTooltip(p.CategoryIndex, this.slices, this.fills, this.formatter, this.percents[p.CategoryIndex] ?? 0),
            Anchor: DonutAnchor(g, p) ?? { X: 0, Y: 0 },
            Announcement: DescribeSlice(p.CategoryIndex, this.slices, this.formatter, this.percents[p.CategoryIndex] ?? 0),
        }),
        RequestRender: () => this.cdr.markForCheck(),
    });

    @Input() set Slices(value: ReadonlyArray<DonutSlice>) { this.slices = value ?? []; this.Controller.MarkDirty(); }
    get Slices(): ReadonlyArray<DonutSlice> { return this.slices; }

    /** `undefined`/`null` (an unset binding) means 0.7 and is not a caller mistake; numbers are clamped to [0, 0.85] and logged. */
    @Input() set InnerRadiusRatio(value: number | null | undefined) {
        this.innerRadiusRatio = value == null
            ? DefaultInnerRadiusRatio
            : ClampInput('InnerRadiusRatio', value, 0, MaxInnerRadiusRatio, this.Controller.Log, this.context());
        this.Controller.MarkDirty();
    }
    get InnerRadiusRatio(): number { return this.innerRadiusRatio; }

    /** `undefined`/`null` (an unset binding) means false. */
    @Input() set ShowPercentLabels(value: boolean | null | undefined) { this.showPercentLabels = value ?? false; this.Controller.MarkDirty(); }
    get ShowPercentLabels(): boolean { return this.showPercentLabels; }

    // Height and AspectRatio skip MarkDirty on purpose: they don't change the controller's view, so the template/frame react to the input change directly.
    /** A px height (minimum 120; clamped and logged), or `'fill'` to take the parent's height. `undefined`/`null` (an unset binding) means 300 and is not a caller mistake. */
    @Input() set Height(value: number | 'fill' | null | undefined) { this.height = ResolveHeightInput(value, this.Controller.Log, this.context()); }
    get Height(): number | 'fill' { return this.height; }

    /** Width ÷ height (e.g. `16 / 9`); wins over `Height`. `undefined`/`null` is off; invalid values are logged and ignored, finite ones clamped to [0.25, 8]. */
    @Input() set AspectRatio(value: number | null | undefined) { this.aspectRatio = ResolveAspectRatioInput(value, this.Controller.Log, this.context()); }
    get AspectRatio(): number | null { return this.aspectRatio; }

    @Input() set ValueFormatter(value: ChartValueFormatter) { this.formatter = value ?? DefaultValueFormatter; this.Controller.MarkDirty(); }
    get ValueFormatter(): ChartValueFormatter { return this.formatter; }

    @Input() set AriaLabel(value: string) { this.ariaLabel = value ?? ''; this.Controller.MarkDirty(); }
    get AriaLabel(): string { return this.ariaLabel; }

    @Input() CenterLabel?: string;
    @Input() CenterValue?: string;
    @Input() ShowLegend = true;
    @Input() ShowTooltip = true;
    @Input() EmptyMessage = 'No data';

    @Output() SliceClick = new EventEmitter<ChartSliceEvent>();

    protected get HeightValue(): number | 'fill' { return this.height; }
    protected get AspectRatioValue(): number | null { return this.aspectRatio; }

    /** Lets the host fill its parent (the frame measures that height); see Height. */
    @HostBinding('class.mj-chart-fill') protected get FillsParent(): boolean { return this.height === 'fill'; }
    public get AriaLabelText(): string { return this.ariaLabel || 'Chart'; }

    /**
     * How far the center label sits above, and the center value below, the center when both are shown.
     * Scales with the line height (12 and 10 px at the 12px default) so the pair never overlaps at larger type.
     */
    protected CenterOffsets(g: DonutGeometry): { Label: number; Value: number } {
        return { Label: Math.round(g.Type.LineHeight * 0.75), Value: Math.round(g.Type.LineHeight * 0.6) };
    }

    public PercentText(arc: DonutArc): string {
        return FormatPercent(arc.Percent / 100);
    }

    public FocusArc(g: DonutGeometry, active: ActivePoint): DonutArc | undefined {
        return g.Arcs.find((a) => a.SliceIndex === active.CategoryIndex);
    }

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
        this.emit(this.Controller.PointerUp(p.X, p.Y, PointerKindOf(event)));
    }

    public OnClick(event: MouseEvent): void {
        const p = LocalPoint(event);
        this.emit(this.Controller.Click(p.X, p.Y));
    }

    public OnKeyCommand(key: ChartFrameKey): void {
        this.emit(this.Controller.Key(key));
    }

    public ngOnDestroy(): void {
        this.Controller.Destroy();
    }

    private emit(point: ActivePoint | null): void {
        if (point === null) {
            return;
        }
        const slice = this.slices[point.CategoryIndex];
        this.SliceClick.emit({
            SliceIndex: point.CategoryIndex,
            Label: slice.Label,
            Value: IsFiniteValue(slice.Value) ? slice.Value : null,
            Percent: this.percents[point.CategoryIndex] ?? 0,
        });
    }

    private context(): string {
        return ChartContext('donut', this.ariaLabel);
    }

    private prepare(log: ChartIssueLog): ChartPreparation {
        const context = this.context();
        this.fills = ResolveFills(this.slices, (i) => this.slices[i].Label, 'slice', log, context);
        // Donut-only: a negative slice is excluded (not invalid), so say so once. The label names it; the value is never logged.
        this.slices.forEach((s, i) => {
            if (IsFiniteValue(s.Value) && s.Value < 0) {
                log.Once(`negative:${i}`, `${context}: slice "${s.Label}" is negative and is left out of the donut.`);
            }
        });
        LogMissingAriaLabel(this.ariaLabel, log, context);
        LogSoftCap(
            this.slices.length > DonutSoftCaps.Slices,
            `${this.slices.length} slices exceeds the documented cap of ${DonutSoftCaps.Slices}; group the tail into "Other".`,
            log, context,
        );
        this.percents = ComputeSlicePercents(this.slices);
        return {
            Status: ValidateSlices(this.slices),
            Legend: this.slices.map((s, i) => ({ Label: s.Label, Color: this.fills[i], Key: `s${i}` })),
        };
    }
}
