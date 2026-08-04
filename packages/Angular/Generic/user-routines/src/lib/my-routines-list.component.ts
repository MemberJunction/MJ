import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJUserRoutineEntity, UserRoutineEngine } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
import { DescribeCronExpression } from '@memberjunction/global';
import { FormatRelativeTime, RoutineChipVariant, RoutineStatusVariant, RunStatusVariant } from './routine-ui-helpers';
import { LoadRoutineTargetCatalog } from './routine-target-catalog';
import { ConversationOpenedEventArgs,
    AfterRoutineDeletedEventArgs,
    AfterRoutinePausedEventArgs,
    AfterRoutineRunNowEventArgs,
    BeforeRoutineDeletedEventArgs,
    BeforeRoutinePausedEventArgs,
    BeforeRoutineRunNowEventArgs,
    RoutineSelectedEventArgs,
} from './user-routines-events';

/** Filter value for the routine Status facet ('all' disables the facet). */
export type RoutineStatusFilter = 'all' | MJUserRoutineEntity['Status'];

/** Emitted whenever the loaded/filtered routine counts change (load, filter, refresh). */
export interface RoutineCounts {
    Filtered: number;
    Total: number;
}

/**
 * "My Routines" — card list of the CURRENT USER's routines with per-card quick actions
 * (run now / pause-resume / edit / history / delete). Data comes from the shared
 * {@link UserRoutineEngine} cache — no ad-hoc RunViews.
 *
 * Reusable (Generic) component: no Router, no page chrome. Mutating quick actions raise
 * cancelable `Before*` events (set `Cancel = true` to veto) followed by informational
 * `After*` events, per the standard MJ Before/After event idiom.
 *
 * Run-now v1 semantics: sets `NextRunAt = now` and saves — the User Routine Dispatcher
 * job claims due routines on its next sweep (within a minute).
 */
@Component({
    standalone: false,
    selector: 'mj-my-routines-list',
    templateUrl: './my-routines-list.component.html',
    styleUrls: ['./my-routines-list.component.css'],
})
export class MyRoutinesListComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private notifications = inject(MJNotificationService);
    private confirm = inject(MJConfirmService);
    private destroy$ = new Subject<void>();

    // ---------------------------------------------------------------
    // Inputs (getter/setter pattern — re-filter on change)
    // ---------------------------------------------------------------
    private _searchText = '';
    /** Free-text filter over routine name, description, and agent name. */
    public get SearchText(): string {
        return this._searchText;
    }
    @Input()
    public set SearchText(value: string) {
        if (value !== this._searchText) {
            this._searchText = value ?? '';
            this.applyFilters();
        }
    }

    private _statusFilter: RoutineStatusFilter = 'all';
    /** Status facet filter. */
    public get StatusFilter(): RoutineStatusFilter {
        return this._statusFilter;
    }
    @Input()
    public set StatusFilter(value: RoutineStatusFilter) {
        if (value !== this._statusFilter) {
            this._statusFilter = value ?? 'all';
            this.applyFilters();
        }
    }

    // ---------------------------------------------------------------
    // Outputs — navigation intents
    // ---------------------------------------------------------------
    /** User asked to create a new routine (empty-state CTA). The host opens the editor. */
    @Output() CreateRequested = new EventEmitter<void>();
    /** User asked to edit a routine. The host opens the editor. */
    @Output() EditRequested = new EventEmitter<MJUserRoutineEntity>();
    /** User asked to view a routine's run history. The host opens the history view. */
    @Output() HistoryRequested = new EventEmitter<MJUserRoutineEntity>();
    /** Informational: a routine was selected (history/detail opened). */
    @Output() RoutineSelected = new EventEmitter<RoutineSelectedEventArgs>();
    /** Loaded/filtered counts changed (load, filter, refresh). */
    @Output() CountsChanged = new EventEmitter<RoutineCounts>();

    // ---------------------------------------------------------------
    // Outputs — cancelable Before/After event pairs
    // ---------------------------------------------------------------
    /** Cancelable: fires before a pause/resume Status toggle is saved. */
    @Output() BeforeRoutinePaused = new EventEmitter<BeforeRoutinePausedEventArgs>();
    /** Informational: fires after a pause/resume Status toggle was saved. */
    @Output() AfterRoutinePaused = new EventEmitter<AfterRoutinePausedEventArgs>();
    /** Cancelable: fires before a routine is queued to run now. */
    @Output() BeforeRoutineRunNow = new EventEmitter<BeforeRoutineRunNowEventArgs>();
    /** Informational: fires after a routine was queued to run now. */
    @Output() AfterRoutineRunNow = new EventEmitter<AfterRoutineRunNowEventArgs>();
    /** Cancelable: fires before a routine (and its recipients) is deleted. */
    @Output() BeforeRoutineDeleted = new EventEmitter<BeforeRoutineDeletedEventArgs>();
    /** Informational: fires after a routine was deleted. */
    @Output() AfterRoutineDeleted = new EventEmitter<AfterRoutineDeletedEventArgs>();

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    public Routines: MJUserRoutineEntity[] = [];
    public FilteredRoutines: MJUserRoutineEntity[] = [];
    public IsLoading = false;
    /** IDs of routines with an in-flight save/delete (disables that card's action buttons). */
    public BusyRoutineIDs = new Set<string>();

    private agentNameByID = new Map<string, string>();
    private agentIconByID = new Map<string, string>();

    // Template helpers (bound, so keep as instance members)
    public readonly DescribeCron = DescribeCronExpression;
    public readonly RelativeTime = FormatRelativeTime;
    public readonly StatusVariant = RoutineStatusVariant;
    public readonly LastRunVariant = RunStatusVariant;

    async ngOnInit(): Promise<void> {
        this.IsLoading = true;
        this.cdr.markForCheck();
        try {
            const engine = this.engine();
            const p = this.ProviderToUse;
            const [, catalog] = await Promise.all([
                engine.Config(false, p.CurrentUser, p),
                LoadRoutineTargetCatalog(p),
            ]);
            this.agentNameByID = catalog.NameByID;
            this.agentIconByID = catalog.IconByID;
            // Reactive: re-render whenever the engine's routines cache mutates
            engine.Routines$.pipe(takeUntil(this.destroy$)).subscribe(() => {
                this.Routines = engine.Routines;
                this.applyFilters();
            });
            this.Routines = engine.Routines;
            this.applyFilters();
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Snapshot of the time-relative strings, keyed by routine ID. Templates must NOT
     * call FormatRelativeTime directly — its value can change between check passes at
     * a minute boundary (NG0100). Rebuilt on every data change and on a 30s timer.
     */
    private relativeText = new Map<string, { Last: string; Next: string }>();
    private relativeTimer: ReturnType<typeof setInterval> | null = null;

    /** Stable-within-a-pass "Last run" text for a routine. */
    public LastRunText(routine: MJUserRoutineEntity): string {
        return this.relativeText.get(routine.ID)?.Last ?? '';
    }

    /** Stable-within-a-pass "Next run" text for a routine. */
    public NextRunText(routine: MJUserRoutineEntity): string {
        return this.relativeText.get(routine.ID)?.Next ?? '';
    }

    private rebuildRelativeText(): void {
        this.relativeText = new Map(this.Routines.map((r) => [r.ID, {
            Last: r.LastRunAt ? FormatRelativeTime(r.LastRunAt) : '',
            Next: r.NextRunAt ? FormatRelativeTime(r.NextRunAt) : '',
        }]));
        if (this.relativeTimer == null && this.Routines.length > 0) {
            this.relativeTimer = setInterval(() => {
                this.rebuildRelativeText();
                this.cdr.markForCheck();
            }, 30_000);
        }
    }

    ngOnDestroy(): void {
        if (this.relativeTimer != null) {
            clearInterval(this.relativeTimer);
        }
        this.destroy$.next();
        this.destroy$.complete();
    }

    /** Force-refreshes the engine cache (and this list). */
    public async Refresh(): Promise<void> {
        this.IsLoading = true;
        this.cdr.markForCheck();
        try {
            await this.engine().Refresh(this.ProviderToUse.CurrentUser);
            this.Routines = this.engine().Routines;
            this.applyFilters();
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    /** Display name of a routine's target agent (falls back when the agent no longer exists). */
    public AgentName(routine: MJUserRoutineEntity): string {
        return this.agentNameByID.get(NormalizeUUID(routine.TargetID)) ?? '(unknown agent)';
    }

    /** The agent's own IconClass, falling back to the standard robot mark. */
    public AgentIcon(routine: MJUserRoutineEntity): string {
        return this.agentIconByID.get(NormalizeUUID(routine.TargetID)) ?? 'fa-solid fa-robot';
    }

    // ---------------------------------------------------------------
    // Quick actions (Before → save → After)
    // ---------------------------------------------------------------

    /** Toggles Active ⇄ Paused (Disabled routines resume to Active as well). */
    public async ToggleStatus(routine: MJUserRoutineEntity): Promise<void> {
        if (this.BusyRoutineIDs.has(routine.ID)) {
            return;
        }
        const previous = routine.Status;
        const newStatus: MJUserRoutineEntity['Status'] = previous === 'Active' ? 'Paused' : 'Active';

        const beforeArgs = new BeforeRoutinePausedEventArgs(routine, newStatus);
        this.BeforeRoutinePaused.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return;
        }

        routine.Status = newStatus;
        const saved = await this.saveRoutine(
            routine,
            newStatus === 'Active' ? `'${routine.Name}' resumed` : `'${routine.Name}' paused`,
            () => (routine.Status = previous)
        );
        if (saved) {
            this.AfterRoutinePaused.emit(new AfterRoutinePausedEventArgs(routine, newStatus));
        }
    }

    /**
     * Run-now v1: stamps NextRunAt = now and saves; the dispatcher job claims due
     * routines on its next sweep. Only meaningful for Active routines.
     */
    public async RunNow(routine: MJUserRoutineEntity): Promise<void> {
        if (this.BusyRoutineIDs.has(routine.ID) || routine.Status !== 'Active') {
            return;
        }
        const beforeArgs = new BeforeRoutineRunNowEventArgs(routine);
        this.BeforeRoutineRunNow.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return;
        }

        const previous = routine.NextRunAt;
        routine.NextRunAt = new Date();
        const saved = await this.saveRoutine(
            routine,
            `'${routine.Name}' queued to run — the dispatcher picks it up within the next minute.`,
            () => (routine.NextRunAt = previous)
        );
        if (saved) {
            this.AfterRoutineRunNow.emit(new AfterRoutineRunNowEventArgs(routine));
        }
    }

    /** Deletes a routine (after user confirmation), removing its recipients first. */
    public async DeleteRoutine(routine: MJUserRoutineEntity): Promise<void> {
        if (this.BusyRoutineIDs.has(routine.ID)) {
            return;
        }
        const beforeArgs = new BeforeRoutineDeletedEventArgs(routine);
        this.BeforeRoutineDeleted.emit(beforeArgs);
        if (beforeArgs.Cancel) {
            return;
        }

        const confirmed = await this.confirm.ConfirmDelete({
            title: 'Delete Routine',
            message: `Delete '${routine.Name}'? Its recipients and run bookkeeping are removed too — the underlying agent/prompt/action run records remain.`,
        });
        if (!confirmed) {
            return;
        }

        this.BusyRoutineIDs.add(routine.ID);
        this.cdr.markForCheck();
        try {
            const engine = this.engine();
            // The server-side entity subclass cascades recipients + run bookkeeping
            // before the routine row (FK cleanup) — one Delete() is the whole story.
            const deleted = await routine.Delete();
            if (!deleted) {
                this.notifications.CreateSimpleNotification(
                    `Delete failed: ${routine.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    'error',
                    6000
                );
                return;
            }
            this.notifications.CreateSimpleNotification(`'${routine.Name}' deleted`, 'success', 3000);
            // Full refresh so the dependent recipient/run configs re-scope
            await engine.Refresh(this.ProviderToUse.CurrentUser);
            this.Routines = engine.Routines;
            this.applyFilters();
            this.AfterRoutineDeleted.emit(new AfterRoutineDeletedEventArgs(routine));
        } finally {
            this.BusyRoutineIDs.delete(routine.ID);
            this.cdr.markForCheck();
        }
    }

    /** The routine's dedicated conversation was requested (chat icon on the card). */
    @Output() ConversationOpened = new EventEmitter<ConversationOpenedEventArgs>();

    /** Raises ConversationOpened for hosts to present the routine's conversation. */
    public OpenConversation(routine: MJUserRoutineEntity): void {
        if (routine.ConversationID) {
            this.ConversationOpened.emit(new ConversationOpenedEventArgs(routine.ConversationID, routine));
        }
    }

    /** Opens a routine's history (raises RoutineSelected + HistoryRequested). */
    public OpenHistory(routine: MJUserRoutineEntity): void {
        this.RoutineSelected.emit(new RoutineSelectedEventArgs(routine));
        this.HistoryRequested.emit(routine);
    }

    /** True when the run-now button should be disabled for this routine. */
    public RunNowDisabled(routine: MJUserRoutineEntity): boolean {
        return routine.Status !== 'Active' || this.BusyRoutineIDs.has(routine.ID);
    }

    /** Chip variant helper narrowed for the template. */
    public ChipClass(variant: RoutineChipVariant): string {
        return `routine-chip routine-chip--${variant}`;
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------
    private engine(): UserRoutineEngine {
        return UserRoutineEngine.GetProviderInstance<UserRoutineEngine>(this.ProviderToUse, UserRoutineEngine) as UserRoutineEngine;
    }

    /** Saves a routine, surfacing LatestResult.CompleteMessage and reverting on failure. */
    private async saveRoutine(routine: MJUserRoutineEntity, successMessage: string, revert: () => void): Promise<boolean> {
        this.BusyRoutineIDs.add(routine.ID);
        this.cdr.markForCheck();
        try {
            const saved = await routine.Save();
            if (saved) {
                this.notifications.CreateSimpleNotification(successMessage, 'success', 3500);
                this.applyFilters();
                return true;
            }
            revert();
            this.notifications.CreateSimpleNotification(
                `Save failed: ${routine.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                'error',
                6000
            );
            return false;
        } finally {
            this.BusyRoutineIDs.delete(routine.ID);
            this.cdr.markForCheck();
        }
    }

    private applyFilters(): void {
        this.rebuildRelativeText();
        const search = this._searchText.trim().toLowerCase();
        this.FilteredRoutines = this.Routines.filter((r) => {
            if (this._statusFilter !== 'all' && r.Status !== this._statusFilter) {
                return false;
            }
            if (search.length > 0) {
                const haystack = `${r.Name ?? ''} ${r.Description ?? ''} ${this.AgentName(r)}`.toLowerCase();
                if (!haystack.includes(search)) {
                    return false;
                }
            }
            return true;
        });
        this.CountsChanged.emit({ Filtered: this.FilteredRoutines.length, Total: this.Routines.length });
        this.cdr.markForCheck();
    }
}
