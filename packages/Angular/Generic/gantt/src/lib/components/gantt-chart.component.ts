import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UUIDsEqual } from '@memberjunction/global';
import { GanttItemData, GanttLinkData, GanttColumnDef, GanttItemClickedEvent, GanttItemChangedEvent } from '../models/gantt.models';
import {
    AfterZoomChangeEventArgs,
    BeforeZoomChangeEventArgs,
    BuildDefaultGanttZoomLevels,
    GanttZoomPercent,
    IsGanttZoomLevelName,
    NextZoomInLevel,
    NextZoomOutLevel,
    type GanttZoomLevelName,
} from '../models/gantt-zoom';
import {
    AfterColumnResizeEventArgs,
    AfterGridResizeEventArgs,
    BeforeColumnResizeEventArgs,
    BeforeGridResizeEventArgs,
    ClampGanttGridWidth,
    GANTT_DEFAULT_GRID_WIDTH,
    GANTT_MAX_GRID_WIDTH,
    GANTT_MIN_GRID_WIDTH,
    SanitizeColumnWidths,
} from '../models/gantt-layout';
import {
    BuildGanttTaskTooltipHtml,
    EnsureGanttTooltipStyles,
    GANTT_GRID_CELL_TOOLTIP_SELECTOR,
} from '../models/gantt-tooltip';
import type { GanttStatic, GridColumn, Task as DHTask, Link as DHLink } from 'dhtmlx-gantt';

/** Default grid columns if none are provided. Pixel widths so the grid can scroll. */
const DEFAULT_COLUMNS: GanttColumnDef[] = [
    { Name: 'text', Label: 'Name', Tree: true, Width: 220 },
    { Name: 'start_date', Label: 'Start', Align: 'center', Width: 96 },
    { Name: 'duration', Label: 'Days', Align: 'center', Width: 64 },
    { Name: 'progress', Label: '%', Align: 'center', Width: 52, Template: (obj: DHTask) => Math.round((obj.progress || 0) * 100) + '%' },
];

interface DhxGridColumn {
    name: string;
    label: string;
    width: number;
    align?: 'left' | 'center' | 'right';
    tree?: boolean;
    template?: (item: DHTask) => string;
    resize?: boolean;
    min_width?: number;
}

/**
 * Generic Gantt chart component wrapping DHTMLX Gantt.
 *
 * Renders items as bars on a timeline with hierarchy, dependency arrows,
 * and progress indicators. The library is loaded lazily via dynamic import.
 *
 * @example
 * ```html
 * <mj-gantt-chart
 *     [Items]="projectTasks"
 *     [Links]="taskDependencies"
 *     [Height]="'600px'"
 *     (ItemClicked)="onTaskClicked($event)">
 * </mj-gantt-chart>
 * ```
 */
@Component({
    selector: 'mj-gantt-chart',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styleUrls: ['./gantt-theme.css'],
    template: `
        @if (loading) {
            <div class="mj-gantt-loading">Loading Gantt chart...</div>
        }
        @if (ShowZoomControls && !loading) {
            <div class="mj-gantt-zoom" role="group" aria-label="Gantt zoom">
                <button type="button" class="mj-gantt-zoom__btn" (click)="ZoomOut()"
                        [disabled]="!CanZoomOut" title="Zoom out (Ctrl + scroll)">
                    <span aria-hidden="true">−</span>
                </button>
                <span class="mj-gantt-zoom__label">{{ CurrentZoomPercent }}%</span>
                <button type="button" class="mj-gantt-zoom__btn" (click)="ZoomIn()"
                        [disabled]="!CanZoomIn" title="Zoom in (Ctrl + scroll)">
                    <span aria-hidden="true">+</span>
                </button>
            </div>
        }
        <div #ganttContainer class="mj-gantt-container" [style.height]="Height"
             [style.display]="loading ? 'none' : 'block'"></div>
    `,
    styles: [`
        :host { display: block; height: 100%; font-family: var(--mj-font-family); }

        .mj-gantt-container {
            width: 100%;
            position: relative;
        }

        .mj-gantt-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--mj-space-16) var(--mj-space-5);
            color: var(--mj-text-muted);
            font-size: var(--mj-text-sm);
        }

        .mj-gantt-zoom {
            display: inline-flex;
            align-items: center;
            gap: var(--mj-space-1);
            margin-bottom: var(--mj-space-2);
        }
        .mj-gantt-zoom__btn {
            width: 28px;
            height: 28px;
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-sm);
            background: var(--mj-bg-surface);
            color: var(--mj-text-primary);
            cursor: pointer;
            font-size: var(--mj-text-base);
            line-height: 1;
        }
        .mj-gantt-zoom__btn:hover:not(:disabled) {
            background: var(--mj-bg-surface-hover);
            border-color: var(--mj-border-strong);
        }
        .mj-gantt-zoom__btn:disabled {
            color: var(--mj-text-disabled);
            cursor: default;
        }
        .mj-gantt-zoom__label {
            min-width: 3.25rem;
            text-align: center;
            font-size: var(--mj-text-xs);
            font-weight: var(--mj-font-semibold);
            color: var(--mj-text-secondary);
        }

        :host ::ng-deep .gantt_task .gantt_task_content { font-weight: var(--mj-font-medium); }
    `]
})
export class MjGanttChartComponent implements AfterViewInit, OnChanges, OnDestroy {
    /** Items (bars) to render on the timeline. */
    @Input() Items: GanttItemData[] = [];

    /** Dependency links (arrows) between items. */
    @Input() Links: GanttLinkData[] = [];

    /** CSS height for the chart container. */
    @Input() Height = '500px';

    /** Disables drag, resize, and link editing. */
    @Input() ReadOnly = true;

    /** Show progress fill on bars. */
    @Input() ShowProgress = true;

    /** Grid column definitions. Defaults to Name, Start, Duration, Progress. */
    @Input() Columns: GanttColumnDef[] | null = null;

    /** When true, Ctrl/Cmd + wheel and ZoomIn/ZoomOut change the timeline scale. */
    @Input() EnableZoom = true;

    /** Show built-in +/- zoom controls above the chart. */
    @Input() ShowZoomControls = false;

    /**
     * Give the left grid its own horizontal scrollbar so columns can be
     * wider than the pane without growing the timeline.
     */
    @Input() EnableGridScroll = true;

    /** Show the splitter between the grid and the timeline. */
    @Input() EnableGridResize = true;

    /**
     * Ask DHTMLX to allow dragging grid column borders.
     * Column-border resize is a DHTMLX Gantt PRO feature — the GPL/community
     * build we ship does not render those handles. The grid/timeline splitter
     * (`EnableGridResize`) still works. Hover the Name cell or bar for the
     * full title when the column is too narrow.
     */
    @Input() EnableColumnResize = true;

    /** Show the full item name (and dates) on hover for truncated grid/bar text. */
    @Input() EnableTooltips = true;

    @Input()
    set GridWidth(value: number) {
        const next = ClampGanttGridWidth(value);
        if (next === this._gridWidth) {
            return;
        }
        this._gridWidth = next;
        if (this.initialized && this.gantt) {
            this.gantt.config.grid_width = next;
            this.gantt.setSizes();
        }
    }
    get GridWidth(): number {
        return this._gridWidth;
    }

    @Input()
    set ColumnWidths(value: Record<string, number> | null) {
        this._columnWidths = SanitizeColumnWidths(value);
    }
    get ColumnWidths(): Record<string, number> {
        return this._columnWidths;
    }

    /**
     * Timeline scale to apply. Callers can bind a persisted level here.
     * Defaults to week (100%).
     */
    @Input()
    set ZoomLevel(value: GanttZoomLevelName) {
        if (!IsGanttZoomLevelName(value) || value === this._zoomLevel) {
            return;
        }
        if (this.initialized && this.EnableZoom) {
            this.applyZoom(value);
            return;
        }
        this._zoomLevel = value;
    }
    get ZoomLevel(): GanttZoomLevelName {
        return this._zoomLevel;
    }

    /** Emitted when an item bar or grid row is clicked. */
    @Output() ItemClicked = new EventEmitter<GanttItemClickedEvent>();

    /** Emitted when an item bar or grid row is double-clicked. */
    @Output() ItemDoubleClicked = new EventEmitter<GanttItemClickedEvent>();

    /** Emitted when an item is changed via drag/resize (only if not ReadOnly). */
    @Output() ItemChanged = new EventEmitter<GanttItemChangedEvent>();

    /** Fired before a zoom change. Set `event.Cancel = true` to keep the current level. */
    @Output() BeforeZoomChange = new EventEmitter<BeforeZoomChangeEventArgs>();

    /** Fired after a zoom change that was not canceled. */
    @Output() AfterZoomChange = new EventEmitter<AfterZoomChangeEventArgs>();

    /** Fired before the grid/timeline splitter drag starts. */
    @Output() BeforeGridResize = new EventEmitter<BeforeGridResizeEventArgs>();

    /** Fired after the grid/timeline splitter is released. */
    @Output() AfterGridResize = new EventEmitter<AfterGridResizeEventArgs>();

    /** Fired before a grid column resize starts. */
    @Output() BeforeColumnResize = new EventEmitter<BeforeColumnResizeEventArgs>();

    /** Fired after a grid column is resized. */
    @Output() AfterColumnResize = new EventEmitter<AfterColumnResizeEventArgs>();

    @ViewChild('ganttContainer', { static: false }) ganttContainer!: ElementRef<HTMLDivElement>;

    /** @internal */
    loading = true;
    private gantt: GanttStatic | null = null;
    private initialized = false;
    private _zoomLevel: GanttZoomLevelName = 'week';
    private zoomInitialized = false;
    private _gridWidth = GANTT_DEFAULT_GRID_WIDTH;
    private _columnWidths: Record<string, number> = {};
    private readonly cdr = inject(ChangeDetectorRef);

    public get CurrentGridWidth(): number {
        return this._gridWidth;
    }

    public get CurrentColumnWidths(): Record<string, number> {
        return { ...this._columnWidths };
    }

    public get CurrentZoomPercent(): number {
        return GanttZoomPercent(this._zoomLevel);
    }

    public get CanZoomIn(): boolean {
        return NextZoomInLevel(this._zoomLevel) != null;
    }

    public get CanZoomOut(): boolean {
        return NextZoomOutLevel(this._zoomLevel) != null;
    }

    /** One step toward hour / more detail. */
    public ZoomIn(): void {
        const next = NextZoomInLevel(this._zoomLevel);
        if (next) {
            this.applyZoom(next);
        }
    }

    /** One step toward year / more context. */
    public ZoomOut(): void {
        const next = NextZoomOutLevel(this._zoomLevel);
        if (next) {
            this.applyZoom(next);
        }
    }

    public SetZoomLevel(level: GanttZoomLevelName): void {
        if (IsGanttZoomLevelName(level)) {
            this.applyZoom(level);
        }
    }

    async ngAfterViewInit(): Promise<void> {
        try {
            const module = await import('dhtmlx-gantt');
            this.gantt = module.gantt;
            this.loading = false;

            if (this.Items.length > 0 && this.ganttContainer) {
                this.initGantt();
            }
        } catch (error) {
            console.error('@memberjunction/ng-gantt: Failed to load dhtmlx-gantt:', error);
            this.loading = false;
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.gantt) return;

        if (this.initialized && this.ganttContainer) {
            this.updateData();
        } else if (!this.initialized && this.ganttContainer && this.Items.length > 0) {
            this.initGantt();
        }
    }

    private destroyDblClick?: () => void;

    ngOnDestroy(): void {
        this.destroyDblClick?.();
        this.destroyDblClick = undefined;
        if (this.initialized && this.gantt) {
            this.gantt.clearAll();
            this.initialized = false;
        }
    }

    /** Rebuilds the Gantt data from the current `Items` and `Links` inputs. */
    public Refresh(): void {
        if (this.initialized) {
            this.updateData();
        }
    }

    private initGantt(): void {
        const g = this.gantt!;
        g.clearAll();

        // Configuration
        g.config.date_format = '%Y-%m-%d %H:%i';
        g.config.show_progress = this.ShowProgress;
        g.config.show_links = true;
        g.config.readonly = this.ReadOnly;
        g.config.details_on_dblclick = false;
        g.config.open_tree_initially = true;
        g.config.fit_tasks = true;
        g.config.row_height = 36;
        this.applyGridConfig(g);
        this.initTooltips(g);

        // Initialize
        g.init(this.ganttContainer.nativeElement);
        this.initialized = true;
        this.initZoom(g);
        this.bindGridCellTooltips(g);
        this.bindGridEvents(g);

        // Event: click
        g.attachEvent('onTaskClick', (id: string) => {
            const item = this.Items.find(i => UUIDsEqual(i.ID, id));
            if (item) {
                this.ItemClicked.emit({ Item: item });
            }
            return true;
        });

        // Event: dblclick (via DHTMLX attachEvent)
        g.attachEvent('onTaskDblClick', (id: string) => {
            const item = this.Items.find(i => UUIDsEqual(i.ID, id));
            if (item) {
                this.ItemDoubleClicked.emit({ Item: item });
            }
            return false; // Suppress default DHTMLX lightbox
        });

        // Native DOM dblclick listener guarantees double click fires even when readonly = true
        this.destroyDblClick?.();
        const dblClickHandler = (e: MouseEvent) => {
            const taskId = g.locate(e);
            if (taskId !== null && taskId !== undefined) {
                const item = this.Items.find(i => UUIDsEqual(i.ID, String(taskId)));
                if (item) {
                    this.ItemDoubleClicked.emit({ Item: item });
                }
            }
        };
        this.ganttContainer.nativeElement.addEventListener('dblclick', dblClickHandler);
        this.destroyDblClick = () => {
            this.ganttContainer?.nativeElement?.removeEventListener('dblclick', dblClickHandler);
        };

        // Event: drag/resize (only fires if not readonly)
        if (!this.ReadOnly) {
            g.attachEvent('onAfterTaskDrag', (id: string) => {
                const task = g.getTask(id);
                const item = this.Items.find(i => UUIDsEqual(i.ID, id));
                if (item && task) {
                    this.ItemChanged.emit({
                        Item: item,
                        NewStartDate: task.start_date as unknown as Date,
                        NewEndDate: task.end_date as unknown as Date,
                        NewDuration: task.duration as number,
                    });
                }
            });
        }

        this.updateData();

        // Force layout after render
        setTimeout(() => g.setSizes(), 0);
    }

    private updateData(): void {
        if (!this.initialized || !this.gantt) return;
        const g = this.gantt;

        const data: Partial<DHTask>[] = this.Items.map(item => {
            const startDate = item.StartDate instanceof Date ? item.StartDate : new Date(item.StartDate);
            let duration = item.Duration ?? 1;
            if (item.EndDate) {
                const endDate = item.EndDate instanceof Date ? item.EndDate : new Date(item.EndDate);
                duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000));
            }

            const rawProgress = item.Progress ?? 0;
            const progress = rawProgress > 1 ? rawProgress / 100 : rawProgress;

            return {
                id: item.ID,
                text: item.Name,
                start_date: this.formatDate(startDate) as any,
                duration,
                progress,
                parent: item.ParentID || 0,
                open: item.Open !== false,
            };
        });

        const links: Partial<DHLink>[] = this.Links.map(link => ({
            id: link.ID,
            source: link.SourceID,
            target: link.TargetID,
            type: this.mapLinkType(link.Type),
        }));

        g.clearAll();
        g.parse({ data: data as DHTask[], links: links as DHLink[] });

        setTimeout(() => g.setSizes(), 0);
    }

    private applyGridConfig(g: GanttStatic): void {
        g.config.autofit = false;
        g.config.keep_grid_width = true;
        g.config.grid_elastic_columns = false;
        g.config.min_grid_column_width = 48;
        g.config.grid_width = this._gridWidth;
        g.config.columns = this.buildGridColumns();
        if (this.EnableGridScroll || this.EnableGridResize) {
            g.config.layout = this.buildScrollableLayout();
        }
    }

    private buildGridColumns(): DhxGridColumn[] {
        const cols = this.Columns ?? DEFAULT_COLUMNS;
        return cols.map((col) => {
            const mapped: DhxGridColumn = {
                name: col.Name,
                label: col.Label,
                width: this.resolveColumnWidth(col),
                min_width: 48,
                resize: this.EnableColumnResize && col.Resize !== false,
            };
            if (col.Align) {
                mapped.align = col.Align;
            }
            if (col.Tree) {
                mapped.tree = true;
            }
            if (col.Template) {
                mapped.template = col.Template;
            }
            return mapped;
        });
    }

    private resolveColumnWidth(col: GanttColumnDef): number {
        const override = this._columnWidths[col.Name];
        if (typeof override === 'number' && override >= 40) {
            return Math.round(override);
        }
        if (typeof col.Width === 'number' && col.Width > 0) {
            return col.Width;
        }
        if (typeof col.Width === 'string' && col.Width !== '*') {
            const parsed = Number(col.Width);
            if (Number.isFinite(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return 120;
    }

    private buildScrollableLayout(): GanttStatic['config']['layout'] {
        return {
            css: 'gantt_container',
            cols: [
                {
                    width: this._gridWidth,
                    min_width: GANTT_MIN_GRID_WIDTH,
                    max_width: GANTT_MAX_GRID_WIDTH,
                    rows: [
                        { view: 'grid', scrollable: true, scrollX: 'gridScroll', scrollY: 'scrollVer' },
                        { view: 'scrollbar', id: 'gridScroll', height: 20 },
                    ],
                },
                { resizer: this.EnableGridResize, width: 1 },
                {
                    rows: [
                        { view: 'timeline', scrollX: 'scrollHor', scrollY: 'scrollVer' },
                        { view: 'scrollbar', id: 'scrollHor', height: 20 },
                    ],
                },
                { view: 'scrollbar', id: 'scrollVer' },
            ],
        };
    }

    private bindGridEvents(g: GanttStatic): void {
        g.attachEvent('onGridResizeStart', (oldWidth: number) => {
            const before = new BeforeGridResizeEventArgs(oldWidth);
            this.BeforeGridResize.emit(before);
            return !before.Cancel;
        });
        g.attachEvent('onGridResizeEnd', (oldWidth: number, newWidth: number) => {
            const width = ClampGanttGridWidth(newWidth);
            this._gridWidth = width;
            this.AfterGridResize.emit(new AfterGridResizeEventArgs(width, oldWidth));
            this.cdr.markForCheck();
            return true;
        });
        g.attachEvent('onColumnResizeStart', (_index: number, column: GridColumn) => {
            const name = String(column.name ?? '');
            const before = new BeforeColumnResizeEventArgs(name, Number(column.width) || 0);
            this.BeforeColumnResize.emit(before);
            return !before.Cancel;
        });
        g.attachEvent('onColumnResizeEnd', (_index: number, column: GridColumn, newWidth: number) => {
            const name = String(column.name ?? '');
            this._columnWidths = { ...this._columnWidths, [name]: Math.round(newWidth) };
            this.AfterColumnResize.emit(new AfterColumnResizeEventArgs(
                name,
                Math.round(newWidth),
                this.CurrentColumnWidths,
            ));
            this.cdr.markForCheck();
            return true;
        });
    }

    private initTooltips(g: GanttStatic): void {
        if (!this.EnableTooltips) {
            return;
        }
        EnsureGanttTooltipStyles();
        g.plugins({ tooltip: true });
        g.templates.tooltip_text = (start, end, task) => this.tooltipHtmlForTask(task, start, end);
    }

    private bindGridCellTooltips(g: GanttStatic): void {
        const tooltips = g.ext?.tooltips;
        if (!this.EnableTooltips || !tooltips) {
            return;
        }
        tooltips.detach(GANTT_GRID_CELL_TOOLTIP_SELECTOR);
        tooltips.tooltipFor({
            selector: GANTT_GRID_CELL_TOOLTIP_SELECTOR,
            html: (event) => this.gridCellTooltip(g, event),
        });
    }

    private gridCellTooltip(g: GanttStatic, event: Event): string | void {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const cell = target.closest<HTMLElement>('[data-column-name]');
        const columnName = cell?.getAttribute('data-column-name');
        if (!columnName || !this.isNameColumn(columnName)) {
            return;
        }
        const id = g.locate(event);
        if (id == null || id === '' || !g.isTaskExists(id)) {
            return;
        }
        return this.tooltipHtmlForTask(g.getTask(id));
    }

    private isNameColumn(columnName: string): boolean {
        const cols = this.Columns ?? DEFAULT_COLUMNS;
        return cols.some((col, index) =>
            col.Name === columnName && (col.Tree === true || col.Name === 'text' || index === 0),
        );
    }

    private tooltipHtmlForTask(
        task: DHTask,
        start?: Date,
        end?: Date,
    ): string | void {
        const html = BuildGanttTaskTooltipHtml({
            Name: String(task?.text ?? ''),
            Start: start ?? task?.start_date ?? null,
            End: end ?? task?.end_date ?? null,
            Progress: typeof task?.progress === 'number' ? task.progress : null,
        });
        return html || undefined;
    }

    private initZoom(g: GanttStatic): void {
        if (!this.EnableZoom || this.zoomInitialized) {
            return;
        }
        const zoom = g.ext?.zoom;
        if (!zoom) {
            return;
        }
        zoom.init({
            levels: BuildDefaultGanttZoomLevels(),
            trigger: 'wheel',
            useKey: 'ctrlKey',
            element: () => this.ganttContainer.nativeElement,
            handler: (event: Event) => this.handleWheelZoom(event),
        });
        zoom.setLevel(this._zoomLevel);
        this.zoomInitialized = true;
    }

    private handleWheelZoom(event: Event): void {
        const wheel = event as WheelEvent;
        if (!wheel.ctrlKey && !wheel.metaKey) {
            return;
        }
        wheel.preventDefault();
        if (wheel.deltaY < 0) {
            this.ZoomIn();
        } else {
            this.ZoomOut();
        }
    }

    private applyZoom(toLevel: GanttZoomLevelName): void {
        if (!this.EnableZoom || toLevel === this._zoomLevel) {
            return;
        }
        const fromLevel = this._zoomLevel;
        const before = new BeforeZoomChangeEventArgs(
            fromLevel,
            toLevel,
            GanttZoomPercent(fromLevel),
            GanttZoomPercent(toLevel),
        );
        this.BeforeZoomChange.emit(before);
        if (before.Cancel) {
            return;
        }
        this._zoomLevel = toLevel;
        if (this.zoomInitialized) {
            this.gantt?.ext.zoom.setLevel(toLevel);
        }
        this.AfterZoomChange.emit(new AfterZoomChangeEventArgs(
            toLevel,
            GanttZoomPercent(toLevel),
            fromLevel,
        ));
        this.cdr.markForCheck();
    }

    private formatDate(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day} 00:00`;
    }

    private mapLinkType(type?: string): string {
        switch (type) {
            case 'FS': return '0';
            case 'SS': return '1';
            case 'FF': return '2';
            case 'SF': return '3';
            default: return '0';
        }
    }
}
