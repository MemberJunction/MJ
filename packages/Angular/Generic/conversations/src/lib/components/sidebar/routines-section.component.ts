import { CompositeKey } from '@memberjunction/core';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJUserRoutineEntity, UserRoutineEngine } from '@memberjunction/core-entities';
import { NormalizeUUID } from '@memberjunction/global';
import { ConversationOpenedEventArgs, FormatRelativeTime, HistoryRecordOpenedEventArgs, LoadRoutineTargetCatalog } from '@memberjunction/ng-user-routines';

/** Maximum routine rows shown in the compact sidebar section. */
const MAX_SIDEBAR_ROUTINES = 4;

/**
 * Compact "Routines" section pinned at the very bottom of the conversations left
 * sidebar: a header (mark + count), the few most relevant routines (status dot,
 * agent icon, name, next-run / last-result one-liner), and a "+" affordance.
 * Clicking the header or a row opens the full User Routines slide-in; "+" opens
 * it straight on the New Routine editor.
 *
 * Visibility gates (both must pass):
 *  1. `ShowRoutines` — host opt-out input bubbled from the top-level conversations
 *     workspace (default true).
 *  2. The current user must have Read permission on 'MJ: User Routines'
 *     (EntityInfo user-permission check) — hidden entirely otherwise.
 */
@Component({
    standalone: false,
    selector: 'mj-conversation-routines-section',
    templateUrl: './routines-section.component.html',
    styleUrls: ['./routines-section.component.css'],
})
export class RoutinesSectionComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    private cdr = inject(ChangeDetectorRef);
    private destroy$ = new Subject<void>();

    private _showRoutines = true;
    /** Host opt-out (bubbled from the top-level conversations component). Default true. */
    @Input()
    public set ShowRoutines(value: boolean) {
        if (value !== this._showRoutines) {
            this._showRoutines = value;
            if (value && !this.initialized) {
                void this.initialize();
            }
            this.cdr.markForCheck();
        }
    }
    public get ShowRoutines(): boolean {
        return this._showRoutines;
    }

    /** True when the current user may read routines (permission gate). */
    public CanRead = false;
    /** The most relevant routines for the compact view. */
    public TopRoutines: MJUserRoutineEntity[] = [];
    /** Total routine count for the header badge. */
    public TotalCount = 0;
    /**
     * A run history row's linked execution record (Agent Run / Prompt Run / Action Log)
     * was clicked. Same shape as the chat area's openEntityRecord — the host (Explorer
     * wrapper or workspace) routes it to navigation; this package never navigates itself.
     */
    @Output() openEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();

    /**
     * The user asked to open a routine's dedicated conversation (the hidden,
     * Application-scoped thread its runs append to). Emits the conversation ID;
     * the host selects it in chat — this component closes the slide-in first.
     */
    @Output() openConversation = new EventEmitter<string>();

    /** Slide-in open state. */
    public SlideInVisible = false;
    /** Routine to open the slide-in on (history view). */
    public SlideInRoutineID: string | null = null;
    /** Whether the slide-in opens straight on the New Routine editor. */
    public SlideInNewRoutine = false;

    public readonly RelativeTime = FormatRelativeTime;

    private agentIconByID = new Map<string, string>();
    private initialized = false;

    /** Section renders only when the opt-out AND permission gates both pass. */
    public get IsVisible(): boolean {
        return this._showRoutines && this.CanRead;
    }

    async ngOnInit(): Promise<void> {
        if (this._showRoutines) {
            await this.initialize();
        }
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /** Opens the slide-in on the routines list (header click). */
    public OpenRoutines(): void {
        this.SlideInRoutineID = null;
        this.SlideInNewRoutine = false;
        this.SlideInVisible = true;
        this.cdr.markForCheck();
    }

    /** Opens the slide-in on one routine's history (row click). */
    public OpenRoutine(routine: MJUserRoutineEntity, event: Event): void {
        event.stopPropagation();
        this.SlideInRoutineID = routine.ID;
        this.SlideInNewRoutine = false;
        this.SlideInVisible = true;
        this.cdr.markForCheck();
    }

    /** Opens the slide-in straight on the New Routine editor ("+" affordance). */
    public NewRoutine(event: Event): void {
        event.stopPropagation();
        this.SlideInRoutineID = null;
        this.SlideInNewRoutine = true;
        this.SlideInVisible = true;
        this.cdr.markForCheck();
    }

    /** Opens the routine's conversation in the host chat surface (closing the slide-in). */
    public OnConversationOpened(args: ConversationOpenedEventArgs): void {
        this.OnSlideInClosed();
        this.SlideInVisible = false;
        this.openConversation.emit(args.ConversationID);
    }

    /** Bridges the slide-in's HistoryRecordOpened to the standard openEntityRecord chain. */
    public OnHistoryRecordOpened(args: HistoryRecordOpenedEventArgs): void {
        this.openEntityRecord.emit({ entityName: args.EntityName, compositeKey: CompositeKey.FromID(args.RecordID) });
    }

    public OnSlideInClosed(): void {
        this.SlideInVisible = false;
        this.SlideInRoutineID = null;
        this.SlideInNewRoutine = false;
        this.cdr.markForCheck();
    }

    /** Status dot CSS class for a routine. */
    public StatusDotClass(routine: MJUserRoutineEntity): string {
        switch (routine.Status) {
            case 'Active': return 'crs-dot crs-dot--active';
            case 'Paused': return 'crs-dot crs-dot--paused';
            default: return 'crs-dot crs-dot--disabled';
        }
    }

    /** The agent's own IconClass, falling back to the standard robot mark. */
    public AgentIcon(routine: MJUserRoutineEntity): string {
        return this.agentIconByID.get(NormalizeUUID(routine.TargetID)) ?? 'fa-solid fa-robot';
    }

    /** One-liner under the routine name: next run, else last result, else unscheduled. */
    public RoutineSummary(routine: MJUserRoutineEntity): string {
        if (routine.Status === 'Active' && routine.NextRunAt) {
            return `Next ${FormatRelativeTime(routine.NextRunAt)}`;
        }
        if (routine.LastRunAt) {
            const status = routine.LastRunStatus ? ` · ${routine.LastRunStatus}` : '';
            return `Last ${FormatRelativeTime(routine.LastRunAt)}${status}`;
        }
        return routine.Status === 'Active' ? 'Not yet scheduled' : routine.Status;
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------
    private async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        const p = this.ProviderToUse;

        // Permission gate: hide entirely when the user lacks Read on the entity
        // (or the entity isn't present in this instance's metadata).
        const entityInfo = p.EntityByName('MJ: User Routines');
        const permissions = entityInfo && p.CurrentUser ? entityInfo.GetUserPermisions(p.CurrentUser) : null;
        this.CanRead = permissions?.CanRead === true;
        if (!this.CanRead) {
            this.cdr.markForCheck();
            return;
        }

        try {
            const engine = UserRoutineEngine.GetProviderInstance<UserRoutineEngine>(p, UserRoutineEngine) as UserRoutineEngine;
            const [, catalog] = await Promise.all([
                engine.Config(false, p.CurrentUser, p),
                LoadRoutineTargetCatalog(p),
            ]);
            this.agentIconByID = catalog.IconByID;
            engine.Routines$.pipe(takeUntil(this.destroy$)).subscribe(() => {
                this.rebuildRows(engine);
            });
            this.rebuildRows(engine);
        } catch (e) {
            console.error('[RoutinesSection] Failed to load routines:', e);
            this.TopRoutines = [];
            this.TotalCount = 0;
        }
        this.cdr.markForCheck();
    }

    /**
     * Picks the most relevant routines for the compact view: Active first (soonest
     * NextRunAt at the top, unscheduled last), then Paused, then Disabled.
     */
    private rebuildRows(engine: UserRoutineEngine): void {
        const routines = engine.Routines;
        this.TotalCount = routines.length;
        const statusRank = (r: MJUserRoutineEntity): number =>
            r.Status === 'Active' ? 0 : r.Status === 'Paused' ? 1 : 2;
        this.TopRoutines = [...routines]
            .sort((a, b) => {
                const rank = statusRank(a) - statusRank(b);
                if (rank !== 0) {
                    return rank;
                }
                const aNext = a.NextRunAt ? new Date(a.NextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
                const bNext = b.NextRunAt ? new Date(b.NextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
                return aNext - bNext;
            })
            .slice(0, MAX_SIDEBAR_ROUTINES);
        this.cdr.markForCheck();
    }
}
