import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { AreaCurve, AreaStackMode, ChartPointEvent, ChartSeries } from '../chart.types';
import { MJChartFrameComponent } from '../internal/chart-frame.component';
import { ChartController, ChartPreparation } from '../internal/chart-controller';
import { ActivePoint, AreaGeometry, ChartAnchor } from '../internal/geometry.types';
import { ChartIssueLog } from '../internal/issue-log';
import { ClampInput, DeferredInput } from '../internal/inputs';
import { LogMissingAriaLabel, LogSoftCap, ResolveFills } from '../internal/prepare-helpers';
import { MJBaseChartComponent } from '../internal/base-chart.component';
import { CategoryChartMode, ValidateCategorySeries } from '../internal/validate';
import { ComputeAreaLayout, ComputePercentShares } from '../internal/area-layout';
import { TypeMetrics } from '../internal/scales';
import { AreaAnchor, AreaCategoryAnchor, AreaPoints, HitTestArea, NavigateGrid } from '../internal/hit-test';
import { BuildCategoryTable, BuildCategoryTooltip, BuildPointEvent, DescribeCategoryPoint } from '../internal/describe';

export const AreaSoftCaps = { Categories: 2000, Series: 10 } as const;

const DefaultFillOpacity = 0.85;

/**
 * Area chart: plain, stacked or 100%-stacked; smooth (monotone, never overshoots) or linear.
 *
 * @example
 * <mj-area-chart AriaLabel="Band mix over time" [Categories]="weeks" [Series]="bands"
 *     StackMode="percent" Curve="smooth"></mj-area-chart>
 */
@Component({
    selector: 'mj-area-chart',
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
                    @for (tick of g.ValueAxis; track tick.Key) {
                        @if (ShowGridlines) {
                            <line class="mj-chart-grid" [attr.x1]="g.Box.X" [attr.x2]="g.Box.X + g.Box.Width" [attr.y1]="tick.Position" [attr.y2]="tick.Position" />
                        }
                        <text class="mj-chart-axis-label" [attr.x]="g.Box.X - g.Type.AxisGap" [attr.y]="tick.Position" [attr.text-anchor]="tick.Anchor" dominant-baseline="middle">{{ tick.Label }}</text>
                    }
                    @for (layer of g.Layers; track layer.SeriesIndex) {
                        <path class="mj-chart-mark" [attr.d]="layer.Path" [style.fill]="layer.Fill" [attr.fill-opacity]="FillOpacityValue"
                            [class.mj-chart-mark-inactive]="pointer.Active !== null && pointer.Active.SeriesIndex !== layer.SeriesIndex" />
                        <path [attr.d]="layer.LinePath" [style.stroke]="layer.Fill" fill="none" stroke-width="2" pointer-events="none" />
                        @for (dot of layer.LonePoints; track dot.X) {
                            <circle class="mj-chart-point" [attr.cx]="dot.X" [attr.cy]="dot.Y" r="3" [style.fill]="layer.Fill"
                                [class.mj-chart-mark-inactive]="pointer.Active !== null && pointer.Active.SeriesIndex !== layer.SeriesIndex" />
                        }
                    }
                    @for (tick of g.CategoryAxis; track tick.Key) {
                        <text class="mj-chart-axis-label" [attr.x]="tick.Position" [attr.y]="g.Box.Y + g.Box.Height + g.Type.LineHeight" [attr.text-anchor]="tick.Anchor">{{ tick.Label }}</text>
                    }
                    @if (pointer.KeyboardActive && pointer.Active; as active) {
                        @if (FocusPoint(g, active); as at) {
                            <circle class="mj-chart-focus" [attr.cx]="at.X" [attr.cy]="at.Y" r="6" />
                        }
                    }
                </svg>
            }
        </mj-chart-frame>
    `,
})
export class MJAreaChartComponent extends MJBaseChartComponent<AreaGeometry> {
    protected readonly ChartKind = 'area';
    private categories: ReadonlyArray<string> = [];
    private series: ReadonlyArray<ChartSeries> = [];
    private stackMode: AreaStackMode = 'none';
    private curve: AreaCurve = 'smooth';
    private showGridlines = true;
    /** Checked on first read, so a clamp log names the chart (see DeferredInput). */
    private readonly fillOpacity = new DeferredInput<number | null | undefined, number>(
        undefined, (v) => (v == null ? DefaultFillOpacity : ClampInput('FillOpacity', v, 0, 1, this.Controller.Log, this.Context())));
    private fills: string[] = [];
    private shares: number[][] | null = null;

    public readonly Controller: ChartController<AreaGeometry> = new ChartController<AreaGeometry>({
        Context: () => this.Context(),
        Prepare: (log) => this.prepare(log),
        Table: () => BuildCategoryTable(this.AriaLabelText, this.categories, this.series, this.formatter, this.shares),
        Layout: (surface) => ComputeAreaLayout({
            Categories: this.categories, Series: this.series, Fills: this.fills, StackMode: this.stackMode,
            Curve: this.curve, Size: surface.Size, Measure: surface.Measure, Type: TypeMetrics(surface.FontSize), Formatter: this.formatter,
            Shares: this.shares,
        }),
        Points: (g) => AreaPoints(g),
        HitTest: (g, x, y) => HitTestArea(g, x, y),
        Navigate: (points, current, key) => NavigateGrid(points, current, key, 'x'),
        Describe: (g, p) => ({
            Tooltip: BuildCategoryTooltip(p.CategoryIndex, p.SeriesIndex, this.categories, this.series, this.fills, this.formatter, this.shares),
            Anchor: AreaCategoryAnchor(g, p.CategoryIndex) ?? { X: 0, Y: 0 },
            Announcement: DescribeCategoryPoint(p.CategoryIndex, p.SeriesIndex, this.categories, this.series, this.formatter, this.shares),
        }),
        RequestRender: () => this.cdr.markForCheck(),
    });

    @Input() set Categories(value: ReadonlyArray<string>) { this.categories = value ?? []; this.Controller.MarkDirty(); }
    get Categories(): ReadonlyArray<string> { return this.categories; }

    @Input() set Series(value: ReadonlyArray<ChartSeries>) { this.series = value ?? []; this.Controller.MarkDirty(); }
    get Series(): ReadonlyArray<ChartSeries> { return this.series; }

    /** `undefined`/`null` (an unset binding) means "none" (plain, unstacked areas). */
    @Input() set StackMode(value: AreaStackMode | null | undefined) { this.stackMode = value ?? 'none'; this.Controller.MarkDirty(); }
    get StackMode(): AreaStackMode { return this.stackMode; }

    /** `undefined`/`null` (an unset binding) means "smooth". */
    @Input() set Curve(value: AreaCurve | null | undefined) { this.curve = value ?? 'smooth'; this.Controller.MarkDirty(); }
    get Curve(): AreaCurve { return this.curve; }

    /** `undefined`/`null` (an unset binding) means "use the default" and is not a caller mistake; numbers are clamped to [0, 1] and logged. */
    @Input() set FillOpacity(value: number | null | undefined) { this.fillOpacity.Set(value); }
    get FillOpacity(): number { return this.fillOpacity.Value; }

    // No MarkDirty: gridlines are template-only, so the input change re-renders them directly.
    /** `undefined`/`null` (an unset binding) means true. Axis labels stay; only the lines go. */
    @Input() set ShowGridlines(value: boolean | null | undefined) { this.showGridlines = value ?? true; }
    get ShowGridlines(): boolean { return this.showGridlines; }

    @Output() PointClick = new EventEmitter<ChartPointEvent>();

    public get FillOpacityValue(): number { return this.fillOpacity.Value; }

    public FocusPoint(g: AreaGeometry, active: ActivePoint): ChartAnchor | null {
        return AreaAnchor(g, active);
    }

    protected EmitPoint(point: ActivePoint): void {
        this.PointClick.emit(BuildPointEvent(point, this.categories, this.series, this.shares));
    }

    private prepare(log: ChartIssueLog): ChartPreparation {
        const context = this.Context();
        this.fills = ResolveFills(this.series, (i) => this.series[i].Name, 'series', log, context);
        LogMissingAriaLabel(this.ariaLabel, log, context);
        LogSoftCap(
            this.categories.length > AreaSoftCaps.Categories || this.series.length > AreaSoftCaps.Series,
            `${this.categories.length} categories × ${this.series.length} series exceeds the documented cap of ${AreaSoftCaps.Categories} × ${AreaSoftCaps.Series}; decimate before charting.`,
            log, context,
        );
        const status = ValidateCategorySeries(this.categories, this.series, this.validationMode());
        this.shares = status.Kind === 'ok' && this.stackMode === 'percent' ? ComputePercentShares(this.series, this.categories.length) : null;
        return { Status: status, Legend: this.series.map((s, i) => ({ Label: s.Name, Color: this.fills[i], Key: `s${i}` })) };
    }

    private validationMode(): CategoryChartMode {
        switch (this.stackMode) {
            case 'none': return 'area-none';
            case 'stacked': return 'area-stacked';
            case 'percent': return 'area-percent';
        }
    }
}
