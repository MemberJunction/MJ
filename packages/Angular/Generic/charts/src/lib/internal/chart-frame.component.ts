import {
    afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostBinding, inject, Injector, Input, OnDestroy, Output, ViewChild,
} from '@angular/core';
import { CdkConnectedOverlay, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
    ChartAnchor, ChartDataStatus, ChartFrameKey, ChartSurface, ChartTypeMetrics, ChartTableModel, ChartTooltipModel, LegendFit, LegendItem, TextMeasure,
} from './geometry.types';
import { FitLegend, LegendConstants } from './describe';
import { DefaultChartHeight, MinChartHeight } from './inputs';
import { ChartIssueLog } from './issue-log';
import { DefaultFontSize, ParseFontSize, TypeMetrics } from './scales';
import { CreateTextMeasure, EstimateTextMeasure } from './text-measure';

/**
 * Spec §10.1: the width used when ResizeObserver is absent, or when the host is hidden at mount and so
 * has no layout width yet. A host hidden later keeps its last visible width instead.
 */
export const FallbackWidth = 600;

/**
 * Where the tooltip prefers to sit relative to its anchor. 'right' is for charts whose marks
 * are stacked rows (horizontal bars): a tooltip above the anchor would cover the row above,
 * and the pointer could not reach it without crossing that row (WCAG 1.4.13).
 */
export type TooltipPlacement = 'above' | 'right';

const PositionAbove: ConnectedPosition = { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 };
const PositionBelow: ConnectedPosition = { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 };
const PositionRight: ConnectedPosition = { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 };
const PositionLeft: ConnectedPosition = { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 };

/**
 * Preferred side first; the CDK falls back down the list when the overlay would not fit.
 * For 'right', left is the last resort: the anchor is the right end of the row's own bar,
 * so a left-placed tooltip would sit over that bar, under the pointer.
 */
const PositionsByPlacement: Record<TooltipPlacement, ConnectedPosition[]> = {
    above: [PositionAbove, PositionBelow, PositionRight, PositionLeft],
    right: [PositionRight, PositionBelow, PositionAbove, PositionLeft],
};

let nextFrameId = 0;

export interface OuterHeightResult { Height: number; FillFellBack: boolean; }

/**
 * The chart's outer box height. An aspect ratio wins (the width is the only free dimension);
 * 'fill' takes the container's height, falling back to the default when the container has none
 * (an auto-height parent measures 0 until the chart gives it height); a number is used as given.
 * Always at least MinChartHeight so the plot never collapses.
 */
export function ResolveOuterHeight(width: number, containerHeight: number, height: number | 'fill', aspectRatio: number | null): OuterHeightResult {
    if (aspectRatio !== null && Number.isFinite(aspectRatio) && aspectRatio > 0) {
        return { Height: Math.max(MinChartHeight, Math.round(width / aspectRatio)), FillFellBack: false };
    }
    if (height === 'fill') {
        const fillable = containerHeight > 0;
        return { Height: Math.max(MinChartHeight, fillable ? containerHeight : DefaultChartHeight), FillFellBack: !fillable };
    }
    return { Height: Math.max(MinChartHeight, height), FillFellBack: false };
}

export function KeyToCommand(key: string): ChartFrameKey | null {
    switch (key) {
        case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': case 'Home': case 'End':
            return key;
        case 'Enter': case ' ':
            return 'Activate';
        case 'Escape':
            return 'Escape';
        default:
            return null;
    }
}

/**
 * Aspect-ratio charts can feed back on themselves: a width change changes the height, which can
 * toggle a page scrollbar, which changes the width again. A width that returns to the one before
 * the last change, within this window, is treated as that echo: the new width is still applied
 * (the chart must fit its container) but the outer height is held, so the page height, and with
 * it the scrollbar, stops changing.
 */
const WidthEchoWindowMs = 500;

/**
 * The largest A/B difference still treated as a scrollbar echo. A classic scrollbar is at most ~17px
 * wide, plus margin; anything wider (a sidebar toggling 1200 -> 900 -> 1200) is a real resize and must
 * get its own ratio height.
 */
const WidthEchoMaxDeltaPx = 24;

/** requestAnimationFrame where available; a 16ms timeout otherwise. Returns a cancel function. */
function scheduleFrame(callback: () => void): () => void {
    if (typeof requestAnimationFrame === 'function') {
        const handle = requestAnimationFrame(() => callback());
        return () => cancelAnimationFrame(handle);
    }
    const handle = setTimeout(callback, 16);
    return () => clearTimeout(handle);
}

/**
 * Internal shell shared by the three charts (spec §5): sizing, legend, empty/invalid
 * states, the accessible group + data table + live region, and the CDK-overlay tooltip.
 * Which datum is active and what the tooltip says come from the chart, not from here.
 */
@Component({
    selector: 'mj-chart-frame',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [OverlayModule],
    styleUrls: ['./chart-frame.component.css'],
    template: `
        <div class="mj-chart" #root role="group" tabindex="0"
            [attr.aria-label]="AriaLabel"
            [attr.aria-describedby]="HelpId"
            [style.height.px]="OuterHeight"
            (keydown)="OnKeyDown($event)"
            (focus)="FocusChange.emit(true)"
            (blur)="FocusChange.emit(false)">
            <div class="mj-chart-plot" [style.height.px]="PlotHeight">
                <ng-content />
                @if (Status.Kind === 'empty') {
                    <div class="mj-chart-state">{{ EmptyMessage }}</div>
                } @else if (Status.Kind === 'invalid') {
                    <div class="mj-chart-state mj-chart-state-invalid">This chart's data is invalid.</div>
                }
                <div class="mj-chart-anchor" cdkOverlayOrigin #anchorOrigin="cdkOverlayOrigin"
                    [style.left.px]="TooltipAnchor?.X ?? 0" [style.top.px]="TooltipAnchor?.Y ?? 0"></div>
            </div>
            @if (LegendRendered) {
                <ul class="mj-chart-legend" [style.line-height.px]="Type.LegendRowHeight" [style.height.px]="LegendLayout.Rows * Type.LegendRowHeight">
                    @for (item of LegendLayout.Visible; track item.Key) {
                        <li class="mj-chart-legend-item"><span class="mj-chart-swatch" [style.width.px]="Type.LegendSwatch" [style.height.px]="Type.LegendSwatch" [style.background]="item.Color"></span>{{ item.Label }}</li>
                    }
                    @if (LegendLayout.HiddenCount > 0) {
                        <li class="mj-chart-legend-item mj-chart-legend-more">+{{ LegendLayout.HiddenCount }} more</li>
                    }
                </ul>
            }
            <span class="mj-chart-sr-only" [attr.id]="HelpId">Use arrow keys to move between values. Press Escape to close the tooltip.</span>
            <div class="mj-chart-sr-only" aria-live="polite">{{ Announcement }}</div>
            @if (Table; as table) {
                <!-- The wrapper clips: a table ignores width: 1px and would widen a scrolling ancestor. -->
                <div class="mj-chart-sr-only"><table>
                    <caption>{{ table.Caption }}@if (table.TruncatedNote) { {{ table.TruncatedNote }} }</caption>
                    <thead><tr><td></td>@for (h of table.ColumnHeaders; track $index) { <th scope="col">{{ h }}</th> }</tr></thead>
                    <tbody>
                        @for (row of table.Rows; track row.Key) {
                            <tr><th scope="row">{{ row.Header }}</th>@for (cell of row.Cells; track $index) { <td>{{ cell }}</td> }</tr>
                        }
                    </tbody>
                </table></div>
            }
        </div>
        <ng-template cdkConnectedOverlay
            [cdkConnectedOverlayOrigin]="anchorOrigin"
            [cdkConnectedOverlayOpen]="TooltipVisible"
            [cdkConnectedOverlayPositions]="TooltipPositions"
            [cdkConnectedOverlayPush]="true"
            (overlayKeydown)="OnOverlayKeydown($event)">
            @if (Tooltip; as tip) {
                <div class="mj-chart-tooltip" role="tooltip"
                    (pointerenter)="TooltipHoverChange.emit(true)"
                    (pointerleave)="TooltipHoverChange.emit(false)">
                    <div class="mj-chart-tooltip-title">{{ tip.Title }}</div>
                    @for (row of tip.Rows; track row.Key) {
                        <div class="mj-chart-tooltip-row" [class.mj-chart-tooltip-row-active]="row.Active">
                            <span class="mj-chart-swatch" [style.width.px]="Type.LegendSwatch" [style.height.px]="Type.LegendSwatch" [style.background]="row.Color"></span>
                            <span class="mj-chart-tooltip-label">{{ row.Label }}</span>
                            <span class="mj-chart-tooltip-value">{{ row.Value }}</span>
                        </div>
                    }
                </div>
            }
        </ng-template>
    `,
})
export class MJChartFrameComponent implements OnDestroy {
    /** A px height, or 'fill' to take the container's height. Overridden by AspectRatio when that is set. */
    @Input() set Height(value: number | 'fill') { this.height = value; this.frozenOuterHeight = null; this.seedOuterHeight(); this.schedulePublish(); }
    get Height(): number | 'fill' { return this.height; }
    /** Width ÷ height, already validated by the chart; null means "use Height". */
    @Input() set AspectRatio(value: number | null) { this.aspectRatio = value; this.frozenOuterHeight = null; this.seedOuterHeight(); this.schedulePublish(); }
    get AspectRatio(): number | null { return this.aspectRatio; }
    @Input() AriaLabel = 'Chart';
    /** Affects whether the legend is shown, hence the plot height, so a change republishes the surface. */
    @Input() set Status(value: ChartDataStatus) { this.status = value; this.schedulePublish(); }
    get Status(): ChartDataStatus { return this.status; }
    @Input() EmptyMessage = 'No data';
    @Input() Table: ChartTableModel | null = null;
    @Input() Announcement = '';
    @Input() Tooltip: ChartTooltipModel | null = null;

    @Input() set ShowLegend(value: boolean) { this.showLegend = value; this.schedulePublish(); }
    get ShowLegend(): boolean { return this.showLegend; }

    @Input() set Legend(items: LegendItem[]) { this.legend = items ?? []; this.schedulePublish(); }
    get Legend(): LegendItem[] { return this.legend; }

    /** Falls back to 'above' for any unknown value. A stable array per placement, so the overlay is not re-positioned on every check. */
    @Input() set TooltipPlacement(value: TooltipPlacement | null | undefined) { this.placement = value === 'right' ? 'right' : 'above'; }
    get TooltipPlacement(): TooltipPlacement { return this.placement; }

    @Input() set TooltipAnchor(anchor: ChartAnchor | null) {
        this.anchor = anchor;
        // The overlay does not follow a moved origin by itself.
        afterNextRender(() => this.overlay?.overlayRef?.updatePosition(), { injector: this.injector });
    }
    get TooltipAnchor(): ChartAnchor | null { return this.anchor; }

    @Output() SurfaceChange = new EventEmitter<ChartSurface>();
    @Output() KeyCommand = new EventEmitter<ChartFrameKey>();
    @Output() FocusChange = new EventEmitter<boolean>();
    @Output() TooltipHoverChange = new EventEmitter<boolean>();

    public readonly HelpId = `mj-chart-${++nextFrameId}-help`;
    /** Derived from the chart root's computed font size; refreshed on every publish. */
    public Type: ChartTypeMetrics = TypeMetrics(DefaultFontSize);
    public LegendLayout: LegendFit = { Visible: [], HiddenCount: 0, Rows: 0 };

    @ViewChild(CdkConnectedOverlay) private overlay?: CdkConnectedOverlay;
    @ViewChild('root', { static: true }) private root!: ElementRef<HTMLElement>;

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly injector = inject(Injector);
    private height: number | 'fill' = DefaultChartHeight;
    private aspectRatio: number | null = null;
    private status: ChartDataStatus = { Kind: 'empty' };
    private lastEmitted: { Width: number; Height: number; Rows: number; Measure: TextMeasure; FontSize: number } | null = null;
    private showLegend = true;
    private legend: LegendItem[] = [];
    private anchor: ChartAnchor | null = null;
    private placement: TooltipPlacement = 'above';
    private measure: TextMeasure = EstimateTextMeasure();
    /** Font size + family the cached `measure` was built for; a new measure only when either changes. */
    private measureKey = '';
    private readonly issues = new ChartIssueLog();
    /** The last visible layout width; FallbackWidth only until the first visible measurement (a hidden mount). */
    private width = FallbackWidth;
    /**
     * The outer height the last publish resolved; the template binds it, so the box and the published plot
     * height change together. Starts at what the first publish yields for the default inputs.
     */
    private outerHeight = ResolveOuterHeight(FallbackWidth, 0, DefaultChartHeight, null).Height;
    /** Last good parent-provided height; 0 means "unknown / not laid out". Only consulted when Height is 'fill'. */
    private containerHeight = 0;
    /** The host measured 0px wide (display:none, detached tab...): its size says nothing, so the chart keeps its last good width and height and stays quiet. */
    private hostHidden = false;
    /** contentRect height of the last ResizeObserver callback; only used to notice a parent-height change in 'fill' mode. */
    private observedHeight = 0;
    /** The last two visible widths (oldest first) with the time each was applied; empty while hidden. Consulted in AspectRatio mode only. */
    private widthHistory: Array<{ Width: number; At: number }> = [];
    /** Outer height held while a width echo is damped; null means "derive it from the width". */
    private frozenOuterHeight: number | null = null;
    private readonly now = (): number => performance.now();
    private rendered = false;
    private observer: ResizeObserver | null = null;
    private cancelFrame: (() => void) | null = null;

    constructor() {
        afterNextRender(() => {
            // Layout width, not getBoundingClientRect: an ancestor transform (a dialog's scale-in) would shrink the reading.
            const width = this.host.nativeElement.offsetWidth;
            this.hostHidden = width <= 0;
            this.width = this.hostHidden ? FallbackWidth : width;
            // A hidden mount records nothing; trackWidthEcho seeds the history at the first visible width.
            if (!this.hostHidden) {
                this.recordWidth(this.width);
            }
            this.rendered = true;
            this.publish();
            if (typeof ResizeObserver !== 'undefined') {
                this.observer = new ResizeObserver((entries) => this.onResize(entries[0]?.contentRect.width ?? 0, entries[0]?.contentRect.height ?? 0));
                this.observer.observe(this.host.nativeElement);
            }
        });
    }

    /**
     * Before the first render nothing is published yet, so the box may follow the inputs directly; otherwise the
     * first paint would show the 300px default and jump a frame later. After that, only publish() moves the box.
     */
    private seedOuterHeight(): void {
        if (!this.rendered) {
            this.outerHeight = ResolveOuterHeight(this.width, 0, this.height, this.aspectRatio).Height;
        }
    }

    public get TooltipPositions(): ConnectedPosition[] {
        return PositionsByPlacement[this.placement];
    }

    /** The chart's outer box height as of the last publish (see ResolveOuterHeight); an input or resize shows here only once it is published. */
    public get OuterHeight(): number {
        return this.outerHeight;
    }

    public get PlotHeight(): number {
        return Math.max(0, this.OuterHeight - this.legendHeight());
    }

    /** Lets the host fill its parent, which is what gives 'fill' a height to measure. */
    @HostBinding('class.mj-chart-frame-fill') public get FillsParent(): boolean {
        return this.height === 'fill';
    }

    /** The single decision for "is the legend on screen"; the template and the reserved height both use it. */
    public get LegendRendered(): boolean {
        return this.showLegend && this.status.Kind === 'ok' && this.LegendLayout.Visible.length > 0;
    }

    public get TooltipVisible(): boolean {
        return this.Tooltip !== null && this.anchor !== null && this.Status.Kind === 'ok';
    }

    public OnKeyDown(event: KeyboardEvent): void {
        const command = KeyToCommand(event.key);
        if (command === null) {
            return;
        }
        event.preventDefault();
        this.KeyCommand.emit(command);
    }

    public OnOverlayKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.KeyCommand.emit('Escape');
        }
    }

    public ngOnDestroy(): void {
        this.observer?.disconnect();
        this.observer = null;
        this.cancelFrame?.();
        this.cancelFrame = null;
    }

    private onResize(width: number, height: number): void {
        const wasHidden = this.hostHidden;
        this.hostHidden = width <= 0;
        const heightChanged = height !== this.observedHeight;
        this.observedHeight = height;
        if (this.hostHidden) {
            // Keep the last visible width and the box as drawn: publishing the fallback here would make
            // the next show paint a frame or two at the wrong size before the real width arrives.
            this.forgetWidthEcho();
            return;
        }
        const widthChanged = width !== this.width;
        this.trackWidthEcho(width, wasHidden, widthChanged);
        this.width = width;
        // A show always publishes: a hold the hide released changes the box even at an unchanged width.
        // The parent's height only matters in 'fill' mode (and with an aspect ratio it is ignored).
        if (wasHidden || widthChanged || (heightChanged && this.measuresFill())) {
            this.schedulePublish();
        }
    }

    /**
     * A hidden host has no layout width, so nothing from before the hide may pair with a width after it:
     * the history is cleared and any held height released. Nothing is published while hidden; the show does.
     */
    private forgetWidthEcho(): void {
        this.widthHistory = [];
        this.frozenOuterHeight = null;
    }

    /**
     * Echo bookkeeping for one visible width (see WidthEchoWindowMs); runs before `width` is updated.
     * The first visible width after a hide or a hidden mount seeds a fresh history, even when it equals
     * the last visible width (otherwise the next A/B/A cycle would have nothing to match). A seed is
     * never an echo: there is nothing before it.
     */
    private trackWidthEcho(nextWidth: number, wasHidden: boolean, widthChanged: boolean): void {
        if (wasHidden) {
            this.recordWidth(nextWidth);
        } else if (widthChanged) {
            // Hold the height on screen, which the echo would undo; any later non-echo width resumes the ratio.
            this.frozenOuterHeight = this.isWidthEcho(nextWidth) ? this.outerHeight : null;
            this.recordWidth(nextWidth);
        }
    }

    private measuresFill(): boolean {
        return this.height === 'fill' && this.aspectRatio === null;
    }

    /**
     * True when `width` returns to the width applied before the last change, soon after that change
     * (see WidthEchoWindowMs), and that change was scrollbar-sized (see WidthEchoMaxDeltaPx).
     */
    private isWidthEcho(width: number): boolean {
        if (this.aspectRatio === null || this.widthHistory.length < 2) {
            return false;
        }
        const [older, newer] = this.widthHistory;
        return older.Width === Math.floor(width)
            && Math.abs(older.Width - newer.Width) <= WidthEchoMaxDeltaPx
            && this.now() - newer.At < WidthEchoWindowMs;
    }

    private recordWidth(width: number): void {
        this.widthHistory = [...this.widthHistory, { Width: Math.floor(width), At: this.now() }].slice(-2);
    }

    /**
     * The height the parent gives the host, read with the chart box out of flow: the chart is
     * already rendered at its own outer height, and an auto-height parent would otherwise
     * report that height back and 'fill' could never notice the parent has none.
     * offsetHeight is the layout height; getBoundingClientRect would include an ancestor transform
     * (a dialog scaling in from 0.95) and leave the chart that much short for good.
     */
    private measureFillHeight(): number {
        const root = this.root.nativeElement;
        const previousDisplay = root.style.display;
        root.style.display = 'none';
        try {
            return this.host.nativeElement.offsetHeight;
        } finally {
            root.style.display = previousDisplay;
        }
    }

    /** Re-reads the chart root's computed type; rebuilds the text measure only when the size or family changed. */
    private refreshType(): void {
        const style = getComputedStyle(this.root.nativeElement);
        const fontSize = ParseFontSize(style.fontSize);
        const key = `${fontSize}|${style.fontFamily}`;
        if (key !== this.measureKey) {
            this.measureKey = key;
            this.measure = CreateTextMeasure(style.fontFamily, fontSize);
        }
        if (fontSize !== this.Type.FontSize) {
            this.Type = TypeMetrics(fontSize);
        }
    }

    /** Coalesces size/legend changes into one publish per animation frame (never during CD). */
    private schedulePublish(): void {
        if (!this.rendered || this.cancelFrame !== null) {
            return;
        }
        this.cancelFrame = scheduleFrame(() => {
            this.cancelFrame = null;
            this.publish();
        });
    }

    private publish(): void {
        this.refreshType();
        // A hidden host keeps the last good height, so toggling visibility can't make fill drop to the fallback.
        if (this.measuresFill() && !this.hostHidden) {
            this.containerHeight = this.measureFillHeight();
        }
        const resolved = ResolveOuterHeight(this.width, this.containerHeight, this.height, this.aspectRatio);
        this.outerHeight = this.frozenOuterHeight ?? resolved.Height;
        if (!this.hostHidden && resolved.FillFellBack) {
            this.issues.Once('fill-height', `chart "${this.AriaLabel}": Height="fill" but the container has no height; using ${DefaultChartHeight}px. Give the parent an explicit height.`);
        }
        this.LegendLayout = this.showLegend ? FitLegend(this.legend, this.width, this.measure, LegendConstants.MaxRows, this.Type) : { Visible: [], HiddenCount: 0, Rows: 0 };
        this.cdr.markForCheck();
        // floor, not round: a fractional host width must never publish a surface wider than the host (horizontal overflow).
        const next = { Width: Math.floor(this.width), Height: this.PlotHeight, Rows: this.LegendLayout.Rows, Measure: this.measure, FontSize: this.Type.FontSize };
        const last = this.lastEmitted;
        // FontSize is intentionally redundant with Measure identity (a new size always builds a new measure); kept as an explicit key.
        // Nothing the chart depends on changed: stay silent so the frame can never feed a re-render loop.
        if (last !== null && last.Width === next.Width && last.Height === next.Height && last.Rows === next.Rows && last.Measure === next.Measure && last.FontSize === next.FontSize) {
            return;
        }
        this.lastEmitted = next;
        this.SurfaceChange.emit({ Size: { Width: next.Width, Height: next.Height }, Measure: next.Measure, FontSize: next.FontSize });
    }

    private legendHeight(): number {
        return this.LegendRendered ? this.LegendLayout.Rows * this.Type.LegendRowHeight + LegendConstants.BottomGap : 0;
    }
}
