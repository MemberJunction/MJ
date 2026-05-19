import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UUIDsEqual } from '@memberjunction/global';
import { GanttItemData, GanttLinkData, GanttColumnDef, GanttItemClickedEvent, GanttItemChangedEvent } from '../models/gantt.models';
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

    /** Emitted when an item bar or grid row is clicked. */
    @Output() ItemClicked = new EventEmitter<GanttItemClickedEvent>();

    /** Emitted when an item is changed via drag/resize (only if not ReadOnly). */
    @Output() ItemChanged = new EventEmitter<GanttItemChangedEvent>();

    @ViewChild('ganttContainer', { static: false }) ganttContainer!: ElementRef<HTMLDivElement>;

    /** @internal */
    loading = true;
    private gantt: GanttStatic | null = null;
    private initialized = false;

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

    ngOnDestroy(): void {
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

        // Event: click
        g.attachEvent('onTaskClick', (id: string) => {
            const item = this.Items.find(i => UUIDsEqual(i.ID, id));
            if (item) {
                this.ItemClicked.emit({ Item: item });
            }
            return true;
        });

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

            return {
                id: item.ID,
                text: item.Name,
                start_date: this.formatDate(startDate) as any,
                duration,
                progress: (item.Progress ?? 0) / 100,
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
