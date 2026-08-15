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
import type { GanttStatic, Task as DHTask, Link as DHLink } from 'dhtmlx-gantt';

/** Default grid columns if none are provided. */
const DEFAULT_COLUMNS: GanttColumnDef[] = [
    { Name: 'text', Label: 'Name', Tree: true, Width: '*' },
    { Name: 'start_date', Label: 'Start', Align: 'center', Width: 90 },
    { Name: 'duration', Label: 'Days', Align: 'center', Width: 60 },
    { Name: 'progress', Label: '%', Align: 'center', Width: 50, Template: (obj: any) => Math.round((obj.progress || 0) * 100) + '%' },
];

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
        :host { display: block; font-family: var(--mj-font-family); }

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

        /* DHTMLX Gantt style overrides for a cleaner look */
        :host ::ng-deep .gantt_container { font-family: var(--mj-font-family); font-size: var(--mj-text-sm); }
        :host ::ng-deep .gantt_grid_scale,
        :host ::ng-deep .gantt_task_scale { background: var(--mj-bg-surface-sunken); border-bottom: 1px solid var(--mj-border-default); }
        :host ::ng-deep .gantt_task .gantt_task_content { font-weight: var(--mj-font-medium); }
        :host ::ng-deep .gantt_row { border-bottom: 1px solid var(--mj-border-subtle); }
        :host ::ng-deep .gantt_task_line { border-radius: var(--mj-radius-sm); }
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

    @ViewChild('ganttContainer', { static: false }) ganttContainer!: ElementRef<HTMLDivElement>;

    /** @internal */
    loading = true;
    private gantt: GanttStatic | null = null;
    private initialized = false;
    private _zoomLevel: GanttZoomLevelName = 'week';
    private zoomInitialized = false;
    private readonly cdr = inject(ChangeDetectorRef);

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

        // Grid columns
        const cols = this.Columns ?? DEFAULT_COLUMNS;
        g.config.columns = cols.map(c => {
            const col: any = {
                name: c.Name,
                label: c.Label,
                width: c.Width === '*' ? '*' : (c.Width ?? 100),
            };
            if (c.Align) col.align = c.Align;
            if (c.Tree) col.tree = true;
            if (c.Template) col.template = c.Template;
            return col;
        });

        // Initialize
        g.init(this.ganttContainer.nativeElement);
        this.initialized = true;
        this.initZoom(g);

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
