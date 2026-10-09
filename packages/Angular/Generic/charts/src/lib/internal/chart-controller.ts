import {
    ActivePoint, ChartAnchor, ChartDataStatus, ChartFrameKey, ChartNavKey, ChartSurface, ChartTableModel, ChartTooltipModel, LegendItem,
} from './geometry.types';
import { ChartIssueLog } from './issue-log';
import { ChartInteraction, PointerKind } from './interaction';
import { SamePoint } from './hit-test';

export interface ChartPreparation { Status: ChartDataStatus; Legend: LegendItem[]; }
export interface ChartPointDescription { Tooltip: ChartTooltipModel; Anchor: ChartAnchor; Announcement: string; }

export interface ChartView<TGeometry> {
    Status: ChartDataStatus;
    Geometry: TGeometry | null;
    Points: ActivePoint[];
    Legend: LegendItem[];
    Table: ChartTableModel | null;
}

export interface ChartPointerView {
    Active: ActivePoint | null;
    TooltipOpen: boolean;
    KeyboardActive: boolean;
    Description: ChartPointDescription | null;
}

export interface ChartControllerOptions<TGeometry> {
    /** e.g. `bar chart "Revenue"` — prefixes every log line. */
    Context(): string;
    /** Resolve colors, log caller mistakes, validate. Runs whenever the view is rebuilt (an input change or a surface change); logging is deduplicated by the ChartIssueLog. */
    Prepare(log: ChartIssueLog): ChartPreparation;
    Table(): ChartTableModel;
    Layout(surface: ChartSurface): TGeometry;
    Points(geometry: TGeometry): ActivePoint[];
    HitTest(geometry: TGeometry, x: number, y: number): ActivePoint | null;
    Navigate(points: ReadonlyArray<ActivePoint>, current: ActivePoint | null, key: ChartNavKey): ActivePoint | null;
    Describe(geometry: TGeometry, point: ActivePoint): ChartPointDescription;
    /** ChangeDetectorRef.markForCheck — schedules CD in zone and zoneless apps alike. */
    RequestRender(): void;
}

/** How long the tooltip survives the pointer leaving the plot, so it can be hovered (WCAG 1.4.13). */
export const PointerLeaveGraceMs = 120;

/**
 * Orchestrates one chart: a memoized view per input snapshot (spec §10.1) plus
 * interaction state. Input setters call MarkDirty(); the template reads View
 * and Pointer, which rebuild at most once per change.
 */
export class ChartController<TGeometry> {
    public readonly Interaction = new ChartInteraction();
    private surface: ChartSurface | null = null;
    private view: ChartView<TGeometry> | null = null;
    private pointer: ChartPointerView | null = null;
    private leaveTimer: ReturnType<typeof setTimeout> | null = null;
    private tooltipHovered = false;
    private destroyed = false;

    constructor(private readonly options: ChartControllerOptions<TGeometry>, public readonly Log: ChartIssueLog = new ChartIssueLog()) {}

    /**
     * Memoized. Building it has two intentional side effects, an exception to
     * "getters are pure": (1) it runs Prepare, which may log a caller mistake
     * once — validation must run on the whole input snapshot, and the first
     * template read is the one point where every input of this change-detection
     * pass has been set; (2) it resets Interaction when the active point no
     * longer exists after a data change, so a stale tooltip/selection can never
     * be rendered against the new data.
     */
    public get View(): ChartView<TGeometry> {
        if (this.view === null) {
            this.view = this.buildView();
        }
        return this.view;
    }

    /** Memoized interaction-derived state; rebuilt only after an interaction or data change. */
    public get Pointer(): ChartPointerView {
        if (this.pointer === null) {
            const view = this.View;
            const active = this.Interaction.Active;
            this.pointer = {
                Active: active,
                TooltipOpen: this.Interaction.TooltipOpen,
                KeyboardActive: this.Interaction.KeyboardActive,
                Description: active !== null && view.Geometry !== null ? this.options.Describe(view.Geometry, active) : null,
            };
        }
        return this.pointer;
    }

    public MarkDirty(): void {
        this.view = null;
        this.pointer = null;
        this.options.RequestRender();
    }

    public SetSurface(surface: ChartSurface): void {
        const prev = this.surface;
        if (prev && prev.Size.Width === surface.Size.Width && prev.Size.Height === surface.Size.Height && prev.Measure === surface.Measure && prev.FontSize === surface.FontSize) {
            return;
        }
        this.surface = surface;
        this.MarkDirty();
    }

    public PointerMove(x: number, y: number): void {
        const hit = this.hitAt(x, y);
        if (hit === null) {
            // A miss is not a leave: the pointer may be on its way to the tooltip (WCAG 1.4.13),
            // so the tooltip gets the same grace period as pointerleave. Nothing to dismiss -> nothing to schedule.
            // An already-pending leave is kept, not re-armed: pointermove fires continuously, so re-arming on
            // every miss would hold a stale tooltip until the pointer rested for a whole grace period.
            if (this.Interaction.Active !== null && this.leaveTimer === null) {
                this.scheduleLeave();
            }
            return;
        }
        this.cancelLeave();
        if (!SamePoint(hit, this.Interaction.Active) || this.Interaction.KeyboardActive || !this.Interaction.TooltipOpen) {
            this.Interaction.Hover(hit);
            this.interactionChanged();
        }
    }

    /**
     * Touch is ignored: browsers fire pointerleave right after a touch pointerup,
     * which would clear the armed point and make the second tap re-arm instead of
     * emit. A touch selection is dismissed by tapping elsewhere or by blur.
     */
    public PointerLeave(kind: PointerKind): void {
        if (this.destroyed || kind === 'touch') {
            return;
        }
        this.scheduleLeave();
    }

    public TooltipHover(hovered: boolean): void {
        if (this.destroyed) {
            return;
        }
        this.tooltipHovered = hovered;
        if (hovered) {
            this.cancelLeave();
        } else {
            this.scheduleLeave();
        }
    }

    /** Returns the point to emit (second touch tap), else null. */
    public PointerUp(x: number, y: number, kind: PointerKind): ActivePoint | null {
        const hit = this.hitAt(x, y);
        const before = this.Interaction.Active;
        const result = this.Interaction.PointerUp(hit, kind);
        // A touch tap on empty space dismisses (Active changes), so 'none' can still be a change.
        if (result !== 'none' || !SamePoint(before, this.Interaction.Active)) {
            this.interactionChanged();
        }
        return result === 'emit' ? hit : null;
    }

    /** Returns the point to emit (mouse click), else null. */
    public Click(x: number, y: number): ActivePoint | null {
        const hit = this.hitAt(x, y);
        return this.Interaction.Click(hit) === 'emit' ? hit : null;
    }

    /** Returns the active point on Activate (Enter/Space), else null. */
    public Key(key: ChartFrameKey): ActivePoint | null {
        if (key === 'Activate') {
            return this.Interaction.Active;
        }
        if (key === 'Escape') {
            this.Interaction.Dismiss();
            this.interactionChanged();
            return null;
        }
        const next = this.options.Navigate(this.View.Points, this.Interaction.Active, key);
        this.Interaction.Navigate(next);
        this.interactionChanged();
        return null;
    }

    public FocusChange(focused: boolean): void {
        if (!focused) {
            this.Interaction.Blur();
            this.interactionChanged();
        }
    }

    public Destroy(): void {
        this.destroyed = true;
        this.tooltipHovered = false;
        this.cancelLeave();
    }

    private buildView(): ChartView<TGeometry> {
        const prep = this.options.Prepare(this.Log);
        this.Log.ReportStatus(prep.Status, this.options.Context());
        const ok = prep.Status.Kind === 'ok';
        const geometry = ok && this.surface !== null ? this.options.Layout(this.surface) : null;
        const points = geometry !== null ? this.options.Points(geometry) : [];
        const active = this.Interaction.Active;
        if (active !== null && !points.some((p) => SamePoint(p, active))) {
            this.Interaction.Reset();
            this.syncTooltipHover();
        }
        return { Status: prep.Status, Geometry: geometry, Points: points, Legend: ok ? prep.Legend : [], Table: ok ? this.options.Table() : null };
    }

    private hitAt(x: number, y: number): ActivePoint | null {
        const geometry = this.View.Geometry;
        return geometry !== null ? this.options.HitTest(geometry, x, y) : null;
    }

    private interactionChanged(): void {
        this.pointer = null;
        this.syncTooltipHover();
        this.options.RequestRender();
    }

    /**
     * The tooltip can vanish while hovered (Escape, tapping elsewhere, data change)
     * without a pointerleave ever firing; a stuck flag would block every later leave.
     */
    private syncTooltipHover(): void {
        if (!this.Interaction.TooltipOpen || this.Interaction.Active === null) {
            this.tooltipHovered = false;
        }
    }

    private scheduleLeave(): void {
        this.cancelLeave();
        this.leaveTimer = setTimeout(() => {
            this.leaveTimer = null;
            if (this.destroyed || this.tooltipHovered) {
                return;
            }
            this.Interaction.Leave();
            this.interactionChanged();
        }, PointerLeaveGraceMs);
    }

    private cancelLeave(): void {
        if (this.leaveTimer !== null) {
            clearTimeout(this.leaveTimer);
            this.leaveTimer = null;
        }
    }
}
