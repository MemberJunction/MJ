import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass, MJGlobal, MJEvent } from '@memberjunction/global';
import { Subscription } from 'rxjs';
import { DevToolsPrefs } from './dev-tools-prefs';
import { buildEventMonitorAgentContext } from './dev-tools-agent-context';
import { AgentToolResult, validateStringParam, validateEnumParam } from '../shared/agent-tool-validation';

interface EventMonitorPrefs {
    filter?: string;
    typeFilter?: string;
    componentFilter?: string;
    codeFilter?: string;
    sortField?: SortField;
    sortDir?: SortDir;
}

interface EventRow {
    seq: number;
    timestamp: Date;
    type: string;
    eventCode?: string;
    componentName: string;
    summary: string;
    args: unknown;
    expanded: boolean;
    /** True when args is null/undefined/empty — used to render a clean empty-state on expand. */
    hasPayload: boolean;
}

type SortField = 'time' | 'type' | 'eventCode' | 'component';
type SortDir = 'asc' | 'desc';

/**
 * Event Monitor — live tail of `MJGlobal.Instance.GetEventListener()`.
 * Captures events into a ring buffer (configurable cap) with filtering,
 * pause/resume, click-to-expand-payload, copy.
 */
@RegisterClass(BaseResourceComponent, 'EventMonitorInspector')
@Component({
    standalone: false,
    selector: 'mj-event-monitor',
    templateUrl: './event-monitor.component.html',
    styleUrls: ['./inspector-shared.css', './event-monitor.component.css']
})
export class EventMonitorComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {

    public readonly MaxEvents = 500;
    public Events: EventRow[] = [];
    public Paused = false;
    public AutoScroll = true;
    public Filter = '';
    public TypeFilter = ''; // '' = all
    public ComponentFilter = ''; // '' = all
    public CodeFilter = ''; // '' = all
    public KnownTypes: string[] = [];
    public KnownComponents: string[] = [];
    public KnownCodes: string[] = [];
    public Stats = { captured: 0, perSecond: 0, kept: 0 };
    public StartedAt = new Date();
    public SortField: SortField = 'time';
    public SortDir: SortDir = 'desc';

    private sub?: Subscription;
    private seq = 0;
    private rateBucket: number[] = []; // event timestamps within last 1s
    private rateTimer?: ReturnType<typeof setInterval>;

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public ngOnInit(): void {
        this.loadPrefs();
        this.subscribe();
        this.rateTimer = setInterval(() => this.tickRate(), 500);
        this.NotifyLoadComplete();
    }

    public ngAfterViewInit(): void {
        // Publish the initial agent context and register the client tools the AI
        // agent can invoke against this surface. Ongoing re-emit happens in the
        // user-action methods (pause/clear/filter/sort) and in tickRate (live metrics).
        this.publishAgentContext();
        this.registerAgentClientTools();
    }

    public ngOnDestroy(): void {
        this.savePrefs();
        this.sub?.unsubscribe();
        if (this.rateTimer) clearInterval(this.rateTimer);
    }

    private loadPrefs(): void {
        const p = DevToolsPrefs.Get<EventMonitorPrefs>('eventMonitor');
        if (!p) return;
        this.Filter = p.filter ?? '';
        this.TypeFilter = p.typeFilter ?? '';
        this.ComponentFilter = p.componentFilter ?? '';
        this.CodeFilter = p.codeFilter ?? '';
        this.SortField = p.sortField ?? 'time';
        this.SortDir = p.sortDir ?? 'desc';
    }

    private savePrefs(): void {
        DevToolsPrefs.Save<EventMonitorPrefs>('eventMonitor', {
            filter: this.Filter,
            typeFilter: this.TypeFilter,
            componentFilter: this.ComponentFilter,
            codeFilter: this.CodeFilter,
            sortField: this.SortField,
            sortDir: this.SortDir
        });
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'Event Monitor'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-bolt'; }

    public TogglePause(): void {
        this.Paused = !this.Paused;
        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    public ToggleAutoScroll(): void {
        this.AutoScroll = !this.AutoScroll;
    }

    public Clear(): void {
        this.Events = [];
        this.seq = 0;
        this.Stats.kept = 0;
        this.cdr.markForCheck();
        this.publishAgentContext();
    }

    public ToggleRow(row: EventRow): void {
        row.expanded = !row.expanded;
    }

    public OnTypeFilterClick(type: string): void {
        this.TypeFilter = this.TypeFilter === type ? '' : type;
        this.publishAgentContext();
    }

    public OnSortClick(field: SortField): void {
        if (this.SortField === field) {
            this.SortDir = this.SortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.SortField = field;
            this.SortDir = field === 'time' ? 'desc' : 'asc';
        }
        this.savePrefs();
        this.publishAgentContext();
    }

    /** Public so the template can call on every ngModelChange (filters, selects). */
    public PersistPrefs(): void {
        this.savePrefs();
        this.publishAgentContext();
    }

    public async OnCopyRow(row: EventRow): Promise<void> {
        const payload = {
            timestamp: row.timestamp.toISOString(),
            type: row.type,
            eventCode: row.eventCode,
            component: row.componentName,
            args: row.args
        };
        try {
            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        } catch { /* clipboard unavailable */ }
    }

    /** Empty-state presentation for the event list — varies by capture state. */
    public get EmptyVariant(): 'empty' | 'warning' | 'no-results' {
        if (this.Stats.captured === 0) return 'empty';
        return this.Paused ? 'warning' : 'no-results';
    }
    public get EmptyIcon(): string {
        if (this.Stats.captured === 0) return 'fa-solid fa-radio';
        return this.Paused ? 'fa-solid fa-pause' : 'fa-solid fa-filter';
    }
    public get EmptyTitle(): string {
        if (this.Stats.captured === 0) return 'Listening for events…';
        return this.Paused ? 'Capture is paused' : 'No events match your filter';
    }
    public get EmptyMessage(): string {
        if (this.Stats.captured === 0) return 'Trigger an action — saves, navigation, AI events all show up here.';
        if (this.Paused) return `${this.Stats.captured} events fired since you paused. Click Resume to start collecting again.`;
        return `${this.Stats.kept} events in buffer · clear filters to see them.`;
    }

    public get FilteredEvents(): EventRow[] {
        let list = this.Events;
        if (this.TypeFilter) list = list.filter(e => e.type === this.TypeFilter);
        if (this.ComponentFilter) list = list.filter(e => e.componentName === this.ComponentFilter);
        if (this.CodeFilter) list = list.filter(e => (e.eventCode ?? '') === this.CodeFilter);

        const q = this.Filter.trim().toLowerCase();
        if (q) {
            list = list.filter(e =>
                e.type.toLowerCase().includes(q) ||
                e.componentName.toLowerCase().includes(q) ||
                e.summary.toLowerCase().includes(q) ||
                (e.eventCode && e.eventCode.toLowerCase().includes(q))
            );
        }

        // Sort (always returns a new array — preserves the natural seq order otherwise)
        const dir = this.SortDir === 'asc' ? 1 : -1;
        const sorted = [...list].sort((a, b) => {
            switch (this.SortField) {
                case 'time':      return (a.seq - b.seq) * dir;
                case 'type':      return a.type.localeCompare(b.type) * dir;
                case 'eventCode': return (a.eventCode ?? '').localeCompare(b.eventCode ?? '') * dir;
                case 'component': return a.componentName.localeCompare(b.componentName) * dir;
                default:          return 0;
            }
        });
        return sorted;
    }

    public ClearFilters(): void {
        this.Filter = '';
        this.TypeFilter = '';
        this.ComponentFilter = '';
        this.CodeFilter = '';
        this.savePrefs();
        this.publishAgentContext();
    }

    public get HasActiveFilters(): boolean {
        return !!(this.Filter || this.TypeFilter || this.ComponentFilter || this.CodeFilter);
    }

    public get UptimeLabel(): string {
        const ms = Date.now() - this.StartedAt.getTime();
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const remainder = s % 60;
        return m > 0 ? `${m}m ${remainder}s` : `${s}s`;
    }

    public TrackBySeq = (_i: number, e: EventRow) => e.seq;

    // ---------- private ----------

    private subscribe(): void {
        try {
            // withReplay = true so we get historical events that were emitted
            // before this component mounted (within MJGlobal's replay buffer).
            this.sub = MJGlobal.Instance.GetEventListener(true).subscribe((evt: MJEvent) => {
                this.handleEvent(evt);
            });
        } catch {
            // Listener unavailable; silent (rare)
        }
    }

    private handleEvent(evt: MJEvent): void {
        this.Stats.captured++;
        this.rateBucket.push(Date.now());

        if (this.Paused) return;

        const type = String(evt.event ?? 'Unknown');
        if (!this.KnownTypes.includes(type)) {
            this.KnownTypes = [...this.KnownTypes, type].sort();
        }

        const componentName = (evt.component as { constructor?: { name?: string } } | null | undefined)?.constructor?.name ?? '(no component)';
        if (!this.KnownComponents.includes(componentName)) {
            this.KnownComponents = [...this.KnownComponents, componentName].sort();
        }
        const code = evt.eventCode;
        if (code && !this.KnownCodes.includes(code)) {
            this.KnownCodes = [...this.KnownCodes, code].sort();
        }

        const hasPayload = this.computeHasPayload(evt.args);

        const row: EventRow = {
            seq: ++this.seq,
            timestamp: new Date(),
            type,
            eventCode: code,
            componentName,
            summary: hasPayload ? this.summarizeArgs(evt.args) : '—',
            args: evt.args,
            expanded: false,
            hasPayload
        };

        this.Events = [row, ...this.Events];
        if (this.Events.length > this.MaxEvents) {
            this.Events = this.Events.slice(0, this.MaxEvents);
        }
        this.Stats.kept = this.Events.length;
        this.cdr.markForCheck();
    }

    private computeHasPayload(args: unknown): boolean {
        if (args === null || args === undefined) return false;
        if (typeof args === 'string') return args.length > 0;
        if (Array.isArray(args)) return args.length > 0;
        if (typeof args === 'object') return Object.keys(args as Record<string, unknown>).length > 0;
        return true; // numbers, booleans count as payload
    }

    private tickRate(): void {
        const cutoff = Date.now() - 1000;
        this.rateBucket = this.rateBucket.filter(t => t >= cutoff);
        this.Stats.perSecond = this.rateBucket.length;
        this.cdr.markForCheck();
        // Keep the agent's view of live metrics (event count / rate) current.
        this.publishAgentContext();
    }

    private summarizeArgs(args: unknown): string {
        if (args === null || args === undefined) return '—';
        if (typeof args === 'string') return args.length > 80 ? args.slice(0, 77) + '…' : args;
        if (typeof args === 'number' || typeof args === 'boolean') return String(args);
        if (Array.isArray(args)) return `[ ${args.length} item${args.length === 1 ? '' : 's'} ]`;
        if (typeof args === 'object') {
            const keys = Object.keys(args as Record<string, unknown>);
            if (keys.length === 0) return '{ }';
            return `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }`;
        }
        return String(args);
    }

    // ========================================
    // AI AGENT CONTEXT & CLIENT TOOLS
    //
    // 🔒 SAFETY BOUNDARY — CLASSIFICATION: SAFE developer diagnostic.
    // The Event Monitor is a live tail of MJGlobal's event bus. The context and
    // tools below report/control only the monitor's own capture state — event
    // counts, live rate, pause flag, the user's filters and sort. No tool reads
    // or mutates application data; the surface is a read-only diagnostic with
    // capture controls scoped entirely to this inspector's in-memory ring buffer.
    // ========================================

    /** Publish the current Event Monitor capture state to the AI agent. */
    private publishAgentContext(): void {
        const filtered = this.FilteredEvents;
        const context = buildEventMonitorAgentContext({
            EventCount: this.Stats.captured,
            BufferedCount: this.Stats.kept,
            EventsPerSecond: this.Stats.perSecond,
            Paused: this.Paused,
            TextFilter: this.Filter,
            TypeFilter: this.TypeFilter,
            ComponentFilter: this.ComponentFilter,
            CodeFilter: this.CodeFilter,
            SortField: this.SortField,
            SortDirection: this.SortDir,
            FilteredCount: filtered.length,
            KnownTypes: this.KnownTypes,
            KnownComponents: this.KnownComponents,
            KnownCodes: this.KnownCodes,
            // Secret-free summaries of the most-recent visible events. `summary` is
            // already a redacted payload-shape preview (keys/length, never values).
            RecentEvents: filtered.slice(0, 25).map(e => ({
                Type: e.type,
                Component: e.componentName,
                Summary: e.summary,
            })),
        });
        this.navigationService.SetAgentContext(this, context);
    }

    /**
     * Register the client tools the AI agent can invoke against the Event Monitor.
     * All operate on the inspector's own capture state — no application mutation.
     * Tools: PauseEventMonitor / ResumeEventMonitor, ClearEventLog,
     * FilterEventsByType, FilterEventsByComponent, ClearEventFilters,
     * SetEventMonitorSort.
     */
    private registerAgentClientTools(): void {
        this.navigationService.SetAgentClientTools(this, [
            {
                Name: 'PauseEventMonitor',
                Description: 'Pause live event capture (events keep counting but are not added to the log).',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    if (!this.Paused) this.TogglePause();
                    return { Success: true };
                },
            },
            {
                Name: 'ResumeEventMonitor',
                Description: 'Resume live event capture after it was paused.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    if (this.Paused) this.TogglePause();
                    return { Success: true };
                },
            },
            {
                Name: 'ClearEventLog',
                Description: 'Clear all events currently held in the Event Monitor buffer.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.Clear();
                    return { Success: true };
                },
            },
            {
                Name: 'FilterEventsByType',
                Description: 'Filter the event log to a single event type. Pass an empty string to clear the type filter.',
                ParameterSchema: { type: 'object', properties: { type: { type: 'string' } }, required: ['type'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByType(params),
            },
            {
                Name: 'FilterEventsByComponent',
                Description: 'Filter the event log to a single emitting component name. Pass an empty string to clear the component filter.',
                ParameterSchema: { type: 'object', properties: { component: { type: 'string' } }, required: ['component'] },
                Handler: async (params: Record<string, unknown>) => this.toolFilterByComponent(params),
            },
            {
                Name: 'ClearEventFilters',
                Description: 'Clear all active Event Monitor filters (text, type, component, code) so every captured event is shown.',
                ParameterSchema: { type: 'object', properties: {} },
                Handler: async () => {
                    this.ClearFilters();
                    this.cdr.markForCheck();
                    return { Success: true };
                },
            },
            {
                Name: 'SetEventMonitorSort',
                Description: 'Set the event log sort field (time | type | eventCode | component) and direction (asc | desc).',
                ParameterSchema: {
                    type: 'object',
                    properties: {
                        field: { type: 'string', enum: ['time', 'type', 'eventCode', 'component'] },
                        direction: { type: 'string', enum: ['asc', 'desc'] },
                    },
                    required: ['field', 'direction'],
                },
                Handler: async (params: Record<string, unknown>) => this.toolSetSort(params),
            },
        ]);
    }

    /** Apply (or clear, on empty string) the event-type filter. */
    private toolFilterByType(params: Record<string, unknown>): AgentToolResult {
        const validated = validateStringParam(params['type'], 'type');
        if (!validated.ok) {
            return validated.result;
        }
        this.TypeFilter = validated.value;
        this.savePrefs();
        this.publishAgentContext();
        this.cdr.markForCheck();
        return { Success: true };
    }

    /** Apply (or clear, on empty string) the component-name filter. */
    private toolFilterByComponent(params: Record<string, unknown>): AgentToolResult {
        const validated = validateStringParam(params['component'], 'component');
        if (!validated.ok) {
            return validated.result;
        }
        this.ComponentFilter = validated.value;
        this.savePrefs();
        this.publishAgentContext();
        this.cdr.markForCheck();
        return { Success: true };
    }

    /** Set the sort field + direction from validated enum params. */
    private toolSetSort(params: Record<string, unknown>): AgentToolResult {
        const field = validateEnumParam<SortField>(params['field'], ['time', 'type', 'eventCode', 'component'], 'field');
        if (!field.ok) {
            return field.result;
        }
        const dir = validateEnumParam<SortDir>(params['direction'], ['asc', 'desc'], 'direction');
        if (!dir.ok) {
            return dir.result;
        }
        this.SortField = field.value;
        this.SortDir = dir.value;
        this.savePrefs();
        this.publishAgentContext();
        this.cdr.markForCheck();
        return { Success: true };
    }
}
