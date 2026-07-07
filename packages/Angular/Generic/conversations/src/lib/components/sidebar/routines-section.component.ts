import { CompositeKey } from '@memberjunction/core';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJUserRoutineEntity, UserRoutineEngine } from '@memberjunction/core-entities';
import { ConversationOpenedEventArgs, HistoryRecordOpenedEventArgs } from '@memberjunction/ng-user-routines';

/**
 * Compact "Routines" entry pinned at the very bottom of the conversations left
 * sidebar: a single header row — mark, "Routines", the ACTIVE routine count, a "+"
 * (straight into the New Routine editor) and a details chevron. No routine rows —
 * the full command-center slide-in is one click away and owns all detail.
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
    /** Number of Active routines — the header badge. */
    public ActiveCount = 0;
    /** Total routines of any status (for the header tooltip). */
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

    private initialized = false;

    /** Section renders only when the opt-out AND permission gates both pass. */
    public get IsVisible(): boolean {
        return this._showRoutines && this.CanRead;
    }

    /** Header tooltip: active/total breakdown. */
    public get HeaderTitle(): string {
        if (this.TotalCount === 0) {
            return 'Routines — none yet, click + to create one';
        }
        return `Routines — ${this.ActiveCount} active of ${this.TotalCount}. Click to open.`;
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

    /** Opens the slide-in on the routines list (header / details click). */
    public OpenRoutines(): void {
        this.SlideInRoutineID = null;
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
            await engine.Config(false, p.CurrentUser, p);
            engine.Routines$.pipe(takeUntil(this.destroy$)).subscribe(() => {
                this.rebuildCounts(engine);
            });
            this.rebuildCounts(engine);
        } catch (e) {
            console.error('[RoutinesSection] Failed to load routines:', e);
            this.ActiveCount = 0;
            this.TotalCount = 0;
        }
        this.cdr.markForCheck();
    }

    private rebuildCounts(engine: UserRoutineEngine): void {
        const routines = engine.Routines;
        this.TotalCount = routines.length;
        this.ActiveCount = routines.filter((r: MJUserRoutineEntity) => r.Status === 'Active').length;
        this.cdr.markForCheck();
    }
}
