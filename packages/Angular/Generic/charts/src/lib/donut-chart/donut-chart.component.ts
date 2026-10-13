import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ChartSliceEvent, DonutSlice } from '../chart.types';
import { MJChartFrameComponent } from '../internal/chart-frame.component';
import { ChartController, ChartPreparation } from '../internal/chart-controller';
import { ActivePoint, DonutArc, DonutGeometry } from '../internal/geometry.types';
import { ChartIssueLog } from '../internal/issue-log';
import { ClampInput } from '../internal/inputs';
import { LogMissingAriaLabel, LogSoftCap, ResolveFills } from '../internal/prepare-helpers';
import { MJBaseChartComponent } from '../internal/base-chart.component';
import { IsFiniteValue, ValidateSlices } from '../internal/validate';
import { ComputeDonutLayout, ComputeSlicePercents } from '../internal/donut-layout';
import { DonutAnchor, DonutPoints, HitTestDonut, NavigateList } from '../internal/hit-test';
import { BuildSliceTable, BuildSliceTooltip, DescribeSlice } from '../internal/describe';
import { FormatPercent, TypeMetrics } from '../internal/scales';

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
export class MJDonutChartComponent extends MJBaseChartComponent<DonutGeometry> {
    protected readonly ChartKind = 'donut';
    private slices: ReadonlyArray<DonutSlice> = [];
    private innerRadiusRatio = DefaultInnerRadiusRatio;
    private showPercentLabels = false;
    private fills: string[] = [];
    private percents: Array<number | null> = [];

    public readonly Controller: ChartController<DonutGeometry> = new ChartController<DonutGeometry>({
        Context: () => this.Context(),
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
            : ClampInput('InnerRadiusRatio', value, 0, MaxInnerRadiusRatio, this.Controller.Log, this.Context());
        this.Controller.MarkDirty();
    }
    get InnerRadiusRatio(): number { return this.innerRadiusRatio; }

    /** `undefined`/`null` (an unset binding) means false. */
    @Input() set ShowPercentLabels(value: boolean | null | undefined) { this.showPercentLabels = value ?? false; this.Controller.MarkDirty(); }
    get ShowPercentLabels(): boolean { return this.showPercentLabels; }

    @Input() CenterLabel?: string;
    @Input() CenterValue?: string;

    @Output() SliceClick = new EventEmitter<ChartSliceEvent>();

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

    protected EmitPoint(point: ActivePoint): void {
        const slice = this.slices[point.CategoryIndex];
        this.SliceClick.emit({
            SliceIndex: point.CategoryIndex,
            Label: slice.Label,
            Value: IsFiniteValue(slice.Value) ? slice.Value : null,
            Percent: this.percents[point.CategoryIndex] ?? 0,
        });
    }

    private prepare(log: ChartIssueLog): ChartPreparation {
        const context = this.Context();
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
