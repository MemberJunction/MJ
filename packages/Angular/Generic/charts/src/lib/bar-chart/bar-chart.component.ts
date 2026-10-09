import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostBinding, inject, Input, OnDestroy, Output } from '@angular/core';
import { BarOrientation, ChartPointEvent, ChartSeries, ChartValueFormatter, DefaultValueFormatter } from '../chart.types';
import { MJChartFrameComponent, TooltipPlacement } from '../internal/chart-frame.component';
import { ChartController, ChartPreparation } from '../internal/chart-controller';
import { ActivePoint, BarGeometry, BarSegment, ChartFrameKey } from '../internal/geometry.types';
import { ChartIssueLog } from '../internal/issue-log';
import { DefaultChartHeight, ResolveAspectRatioInput, ResolveHeightInput } from '../internal/inputs';
import { ChartContext, LogMissingAriaLabel, LogSoftCap, ResolveFills } from '../internal/prepare-helpers';
import { ValidateCategorySeries } from '../internal/validate';
import { ComputeBarLayout } from '../internal/bar-layout';
import { TypeMetrics } from '../internal/scales';
import { BarAnchor, BarCategoryAnchor, BarPoints, HitTestBar, NavigateGrid } from '../internal/hit-test';
import { BuildCategoryTable, BuildCategoryTooltip, BuildPointEvent, DescribeCategoryPoint } from '../internal/describe';
import { LocalPoint, PointerKindOf } from '../internal/pointer';

export const BarSoftCaps = { Categories: 200, Series: 10 } as const;

/**
 * Bar chart: horizontal or vertical, grouped or stacked (negatives stack away
 * from zero). Colors come from `Color` tokens or `var(--mj-viz-N)`.
 *
 * @example
 * <mj-bar-chart AriaLabel="Score bands by model" [Categories]="models" [Series]="bands"
 *     Orientation="horizontal" [Stacked]="true" (SegmentClick)="open($event)"></mj-bar-chart>
 */
@Component({
    selector: 'mj-bar-chart',
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
            [TooltipPlacement]="TooltipPlacementValue"
            (SurfaceChange)="Controller.SetSurface($event)"
            (KeyCommand)="OnKeyCommand($event)"
            (FocusChange)="Controller.FocusChange($event)"
            (TooltipHoverChange)="Controller.TooltipHover($event)">
            @if (view.Geometry; as g) {
                <svg class="mj-chart-svg" aria-hidden="true" [attr.width]="g.Size.Width" [attr.height]="g.Size.Height"
                    (pointermove)="OnPointerMove($event)" (pointerleave)="OnPointerLeave($event)"
                    (pointerup)="OnPointerUp($event)" (click)="OnClick($event)">
                    @for (tick of g.ValueAxis; track tick.Key) {
                        @if (g.Orientation === 'horizontal') {
                            @if (ShowGridlines) {
                                <line class="mj-chart-grid" [attr.x1]="tick.Position" [attr.x2]="tick.Position" [attr.y1]="g.Box.Y" [attr.y2]="g.Box.Y + g.Box.Height" />
                            }
                            <text class="mj-chart-axis-label" [attr.x]="tick.Position" [attr.y]="g.Box.Y + g.Box.Height + g.Type.LineHeight" [attr.text-anchor]="tick.Anchor">{{ tick.Label }}</text>
                        } @else {
                            @if (ShowGridlines) {
                                <line class="mj-chart-grid" [attr.x1]="g.Box.X" [attr.x2]="g.Box.X + g.Box.Width" [attr.y1]="tick.Position" [attr.y2]="tick.Position" />
                            }
                            <text class="mj-chart-axis-label" [attr.x]="g.Box.X - g.Type.AxisGap" [attr.y]="tick.Position" [attr.text-anchor]="tick.Anchor" dominant-baseline="middle">{{ tick.Label }}</text>
                        }
                    }
                    @for (seg of g.Segments; track seg.Key) {
                        <path class="mj-chart-mark" [attr.d]="seg.Path" [style.fill]="seg.Fill"
                            [class.mj-chart-mark-inactive]="pointer.Active !== null && !IsActive(seg, pointer.Active)" />
                    }
                    @for (tick of g.CategoryAxis; track tick.Key) {
                        @if (g.Orientation === 'horizontal') {
                            <text class="mj-chart-axis-label" [attr.x]="g.Box.X - g.Type.AxisGap" [attr.y]="tick.Position" [attr.text-anchor]="tick.Anchor" dominant-baseline="middle">{{ tick.Label }}</text>
                        } @else {
                            <text class="mj-chart-axis-label" [attr.x]="tick.Position" [attr.y]="g.Box.Y + g.Box.Height + g.Type.LineHeight" [attr.text-anchor]="tick.Anchor">{{ tick.Label }}</text>
                        }
                    }
                    @if (pointer.KeyboardActive && pointer.Active; as active) {
                        @if (FocusSegment(g, active); as seg) {
                            <rect class="mj-chart-focus" [attr.x]="seg.X - 2" [attr.y]="seg.Y - 2" [attr.width]="seg.Width + 4" [attr.height]="seg.Height + 4" rx="4" />
                        }
                    }
                </svg>
            }
        </mj-chart-frame>
    `,
})
export class MJBarChartComponent implements OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private categories: ReadonlyArray<string> = [];
    private series: ReadonlyArray<ChartSeries> = [];
    private orientation: BarOrientation = 'vertical';
    private stacked = false;
    private showGridlines = true;
    private height: number | 'fill' = DefaultChartHeight;
    private aspectRatio: number | null = null;
    private formatter: ChartValueFormatter = DefaultValueFormatter;
    private ariaLabel = '';
    private fills: string[] = [];

    public readonly Controller: ChartController<BarGeometry> = new ChartController<BarGeometry>({
        Context: () => this.context(),
        Prepare: (log) => this.prepare(log),
        Table: () => BuildCategoryTable(this.AriaLabelText, this.categories, this.series, this.formatter, null),
        Layout: (surface) => ComputeBarLayout({
            Categories: this.categories, Series: this.series, Fills: this.fills, Orientation: this.orientation,
            Stacked: this.stacked, Size: surface.Size, Measure: surface.Measure, Type: TypeMetrics(surface.FontSize), Formatter: this.formatter,
        }),
        Points: (g) => BarPoints(g),
        HitTest: (g, x, y) => HitTestBar(g, x, y),
        Navigate: (points, current, key) => NavigateGrid(points, current, key, this.orientation === 'horizontal' ? 'y' : 'x'),
        Describe: (g, p) => ({
            Tooltip: BuildCategoryTooltip(p.CategoryIndex, p.SeriesIndex, this.categories, this.series, this.fills, this.formatter, null),
            Anchor: BarCategoryAnchor(g, p.CategoryIndex) ?? { X: 0, Y: 0 },
            Announcement: DescribeCategoryPoint(p.CategoryIndex, p.SeriesIndex, this.categories, this.series, this.formatter, null),
        }),
        RequestRender: () => this.cdr.markForCheck(),
    });

    @Input() set Categories(value: ReadonlyArray<string>) { this.categories = value ?? []; this.Controller.MarkDirty(); }
    get Categories(): ReadonlyArray<string> { return this.categories; }

    @Input() set Series(value: ReadonlyArray<ChartSeries>) { this.series = value ?? []; this.Controller.MarkDirty(); }
    get Series(): ReadonlyArray<ChartSeries> { return this.series; }

    /** `undefined`/`null` (an unset binding) means "vertical". */
    @Input() set Orientation(value: BarOrientation | null | undefined) { this.orientation = value ?? 'vertical'; this.Controller.MarkDirty(); }
    get Orientation(): BarOrientation { return this.orientation; }

    /** `undefined`/`null` (an unset binding) means "grouped". */
    @Input() set Stacked(value: boolean | null | undefined) { this.stacked = value ?? false; this.Controller.MarkDirty(); }
    get Stacked(): boolean { return this.stacked; }

    // Height, AspectRatio and ShowGridlines skip MarkDirty on purpose: they don't change the controller's view, so the template/frame react to the input change directly.
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

    // No MarkDirty (see Height): gridlines are template-only, so the input change re-renders them directly.
    /** `undefined`/`null` (an unset binding) means true. Axis labels stay; only the lines go. */
    @Input() set ShowGridlines(value: boolean | null | undefined) { this.showGridlines = value ?? true; }
    get ShowGridlines(): boolean { return this.showGridlines; }

    @Input() ShowLegend = true;
    @Input() ShowTooltip = true;
    @Input() EmptyMessage = 'No data';

    @Output() SegmentClick = new EventEmitter<ChartPointEvent>();

    protected get HeightValue(): number | 'fill' { return this.height; }
    protected get AspectRatioValue(): number | null { return this.aspectRatio; }

    /** Lets the host fill its parent (the frame measures that height); see Height. */
    @HostBinding('class.mj-chart-fill') protected get FillsParent(): boolean { return this.height === 'fill'; }
    public get AriaLabelText(): string { return this.ariaLabel || 'Chart'; }

    /** Horizontal bars are stacked rows: a tooltip above the anchor would cover the row above and be unreachable by mouse. */
    public get TooltipPlacementValue(): TooltipPlacement { return this.orientation === 'horizontal' ? 'right' : 'above'; }

    public IsActive(seg: BarSegment, active: ActivePoint): boolean {
        return seg.CategoryIndex === active.CategoryIndex && seg.SeriesIndex === active.SeriesIndex;
    }

    public FocusSegment(g: BarGeometry, active: ActivePoint): BarSegment | undefined {
        return g.Segments.find((s) => this.IsActive(s, active));
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
        if (point !== null) {
            this.SegmentClick.emit(BuildPointEvent(point, this.categories, this.series, null));
        }
    }

    private context(): string {
        return ChartContext('bar', this.ariaLabel);
    }

    private prepare(log: ChartIssueLog): ChartPreparation {
        const context = this.context();
        this.fills = ResolveFills(this.series, (i) => this.series[i].Name, 'series', log, context);
        LogMissingAriaLabel(this.ariaLabel, log, context);
        LogSoftCap(
            this.categories.length > BarSoftCaps.Categories || this.series.length > BarSoftCaps.Series,
            `${this.categories.length} categories × ${this.series.length} series exceeds the documented cap of ${BarSoftCaps.Categories} × ${BarSoftCaps.Series}; aggregate before charting.`,
            log, context,
        );
        return {
            Status: ValidateCategorySeries(this.categories, this.series, 'bar'),
            Legend: this.series.map((s, i) => ({ Label: s.Name, Color: this.fills[i], Key: `s${i}` })),
        };
    }
}
