import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJUserRoutineRunEntity, UserRoutineEngine } from '@memberjunction/core-entities';
import { FormatDuration, FormatRelativeTime, RunStatusVariant } from './routine-ui-helpers';
import { HistoryRecordOpenedEventArgs } from './user-routines-events';

/** The linked execution record behind a run. */
export interface RoutineRunLink {
    EntityName: string;
    RecordID: string;
    Label: string;
}

/**
 * Run history for one routine: start time, duration, outcome, result summary, and a
 * link to the underlying execution record (Agent Run / Prompt Run / Action Execution
 * Log) when linked. Data comes from the shared {@link UserRoutineEngine} cache.
 *
 * Reusable (Generic) component: navigation is delegated to the host via the
 * `HistoryRecordOpened` output — no Router usage here.
 */
@Component({
    standalone: false,
    selector: 'mj-user-routine-history',
    templateUrl: './routine-history.component.html',
    styleUrls: ['./routine-history.component.css'],
})
export class RoutineHistoryComponent extends BaseAngularComponent implements OnDestroy {
    private cdr = inject(ChangeDetectorRef);

    private _routineID: string | null = null;
    /** The routine whose runs to show. Setting (or changing) it reloads the list. */
    @Input()
    public set RoutineID(value: string | null) {
        if (value !== this._routineID) {
            this._routineID = value;
            void this.Refresh();
        }
    }
    public get RoutineID(): string | null {
        return this._routineID;
    }

    /** Optional display name of the routine (header context only). */
    @Input() RoutineName: string | null = null;

    /** Maximum number of runs to show (most recent first). */
    @Input() MaxRuns = 100;

    /** The user asked to open the linked execution record — the host owns navigation. */
    @Output() HistoryRecordOpened = new EventEmitter<HistoryRecordOpenedEventArgs>();

    public Runs: MJUserRoutineRunEntity[] = [];
    public IsLoading = false;
    public LoadError: string | null = null;

    public readonly RelativeTime = FormatRelativeTime;

    /**
     * Snapshot of each run's relative "started" text (see NG0100 — time-relative
     * values must not be computed inside the template). Rebuilt on load + 30s timer.
     */
    private startedText = new Map<string, string>();
    private relativeTimer: ReturnType<typeof setInterval> | null = null;

    /** Stable-within-a-pass relative "started" text for a run row. */
    public StartedText(run: MJUserRoutineRunEntity): string {
        return this.startedText.get(run.ID) ?? '';
    }

    private rebuildRelativeText(): void {
        this.startedText = new Map(this.Runs.map((r) => [r.ID, FormatRelativeTime(r.StartedAt)]));
        if (this.relativeTimer == null && this.Runs.length > 0) {
            this.relativeTimer = setInterval(() => {
                this.rebuildRelativeText();
                this.cdr.markForCheck();
            }, 30_000);
        }
    }
    public readonly Duration = FormatDuration;
    public readonly RunVariant = RunStatusVariant;

    /** Reloads runs for the current routine from the engine cache. */
    public async Refresh(forceEngineRefresh = false): Promise<void> {
        if (!this._routineID) {
            this.Runs = [];
            this.cdr.markForCheck();
            return;
        }
        const routineID = this._routineID;
        this.IsLoading = true;
        this.LoadError = null;
        this.cdr.markForCheck();
        try {
            const p = this.ProviderToUse;
            const engine = UserRoutineEngine.GetProviderInstance<UserRoutineEngine>(p, UserRoutineEngine) as UserRoutineEngine;
            await engine.Config(forceEngineRefresh, p.CurrentUser, p);
            if (routineID !== this._routineID) {
                return; // a newer routine selection superseded this load
            }
            this.Runs = engine.RunsForRoutine(routineID, this.MaxRuns);
            this.rebuildRelativeText();
        } catch (e) {
            this.Runs = [];
            this.LoadError = e instanceof Error ? e.message : 'Failed to load run history.';
        } finally {
            if (routineID === this._routineID) {
                this.IsLoading = false;
                this.cdr.markForCheck();
            }
        }
    }

    /** The linked execution record for a run (null when none of the FKs are set). */
    public LinkFor(run: MJUserRoutineRunEntity): RoutineRunLink | null {
        if (run.AgentRunID) {
            return { EntityName: 'MJ: AI Agent Runs', RecordID: run.AgentRunID, Label: 'Agent run' };
        }
        if (run.PromptRunID) {
            return { EntityName: 'MJ: AI Prompt Runs', RecordID: run.PromptRunID, Label: 'Prompt run' };
        }
        if (run.ActionExecutionLogID) {
            return { EntityName: 'MJ: Action Execution Logs', RecordID: run.ActionExecutionLogID, Label: 'Action log' };
        }
        return null;
    }

    public OpenLink(run: MJUserRoutineRunEntity): void {
        const link = this.LinkFor(run);
        if (link) {
            const p = this.ProviderToUse;
            const engine = UserRoutineEngine.GetProviderInstance<UserRoutineEngine>(p, UserRoutineEngine) as UserRoutineEngine;
            const routine = this._routineID ? (engine.GetRoutineByID(this._routineID) ?? null) : null;
            this.HistoryRecordOpened.emit(new HistoryRecordOpenedEventArgs(link.EntityName, link.RecordID, routine));
        }
    }

    public ChipClass(status: string | null | undefined): string {
        return `history-chip history-chip--${RunStatusVariant(status)}`;
    }

    ngOnDestroy(): void {
        if (this.relativeTimer != null) {
            clearInterval(this.relativeTimer);
        }
    }
}
