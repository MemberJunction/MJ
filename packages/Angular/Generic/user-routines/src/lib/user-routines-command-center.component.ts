import { ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJUserRoutineEntity, UserRoutineEngine } from '@memberjunction/core-entities';
import { MyRoutinesListComponent, RoutineCounts, RoutineStatusFilter } from './my-routines-list.component';
import { RoutineHistoryComponent } from './routine-history.component';
import { ConversationOpenedEventArgs,
    AfterRoutineCreatedEventArgs,
    AfterRoutineDeletedEventArgs,
    AfterRoutinePausedEventArgs,
    AfterRoutineRunNowEventArgs,
    BeforeRoutineCreatedEventArgs,
    BeforeRoutineDeletedEventArgs,
    BeforeRoutinePausedEventArgs,
    BeforeRoutineRunNowEventArgs,
    HistoryRecordOpenedEventArgs,
    RoutineSelectedEventArgs,
} from './user-routines-events';

/** The command center's active internal view. */
export type UserRoutinesView = 'list' | 'editor' | 'history';

/**
 * User Routines "command center" — the composite surface combining the routines list
 * (default view), the create/edit form, and per-routine run history behind an internal
 * tabbed navigation. This is the component hosts embed (Explorer full page, the
 * slide-in, or any custom app); the individual pieces remain exported for bespoke
 * layouts.
 *
 * All child events bubble here unchanged (including the cancelable Before/After
 * pairs), so a consumer only ever wires this one component.
 */
@Component({
    standalone: false,
    selector: 'mj-user-routines-command-center',
    templateUrl: './user-routines-command-center.component.html',
    styleUrls: ['./user-routines-command-center.component.css'],
})
export class UserRoutinesCommandCenterComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    @ViewChild('list') private list?: MyRoutinesListComponent;
    @ViewChild('history') private history?: RoutineHistoryComponent;

    // ---------------------------------------------------------------
    // Inputs
    // ---------------------------------------------------------------
    /** Render the built-in compact header (mark + tabs + list controls). Hosts with their own chrome set false. */
    @Input() ShowHeader = true;
    /** Show a close (X) affordance in the built-in header (used by the slide-in wrapper). */
    @Input() ShowClose = false;

    private _selectedRoutineID: string | null = null;
    /**
     * Deep-link style selection: setting a routine ID opens its history view
     * (clearing it returns to the list). Used by Explorer's query-param round trip.
     */
    @Input()
    public set SelectedRoutineID(value: string | null) {
        if (value !== this._selectedRoutineID) {
            this._selectedRoutineID = value;
            if (value) {
                this.openHistoryById(value);
            } else if (this.ActiveView === 'history') {
                this.ShowList();
            }
        }
    }
    public get SelectedRoutineID(): string | null {
        return this._selectedRoutineID;
    }

    /** Search text applied to the list view (hosts with their own chrome bind this). */
    @Input() SearchText = '';
    /** Status filter applied to the list view. */
    @Input() StatusFilter: RoutineStatusFilter = 'all';

    // ---------------------------------------------------------------
    // Outputs — bubbled child events + view changes
    // ---------------------------------------------------------------
    @Output() BeforeRoutineCreated = new EventEmitter<BeforeRoutineCreatedEventArgs>();
    @Output() AfterRoutineCreated = new EventEmitter<AfterRoutineCreatedEventArgs>();
    @Output() BeforeRoutinePaused = new EventEmitter<BeforeRoutinePausedEventArgs>();
    @Output() AfterRoutinePaused = new EventEmitter<AfterRoutinePausedEventArgs>();
    @Output() BeforeRoutineRunNow = new EventEmitter<BeforeRoutineRunNowEventArgs>();
    @Output() AfterRoutineRunNow = new EventEmitter<AfterRoutineRunNowEventArgs>();
    @Output() BeforeRoutineDeleted = new EventEmitter<BeforeRoutineDeletedEventArgs>();
    @Output() AfterRoutineDeleted = new EventEmitter<AfterRoutineDeletedEventArgs>();
    @Output() RoutineSelected = new EventEmitter<RoutineSelectedEventArgs>();
    @Output() HistoryRecordOpened = new EventEmitter<HistoryRecordOpenedEventArgs>();
    /** Re-emitted from the list — the routine's dedicated conversation was requested. */
    @Output() ConversationOpened = new EventEmitter<ConversationOpenedEventArgs>();
    /** Loaded/filtered counts changed in the list view. */
    @Output() CountsChanged = new EventEmitter<RoutineCounts>();
    /** The active internal view changed ('list' | 'editor' | 'history'). */
    @Output() ViewChanged = new EventEmitter<UserRoutinesView>();
    /** The user clicked the built-in close affordance (slide-in wrapper handles it). */
    @Output() CloseRequested = new EventEmitter<void>();
    /**
     * The selected routine (history view) changed — `null` when returning to the list.
     * Hosts using query-param round trips two-way bind [(SelectedRoutineID)].
     */
    @Output() SelectedRoutineIDChange = new EventEmitter<string | null>();

    // ---------------------------------------------------------------
    // State
    // ---------------------------------------------------------------
    public ActiveView: UserRoutinesView = 'list';
    /** Routine being edited (null = creating a new one). */
    public EditingRoutineID: string | null = null;
    /** Routine whose history is open. */
    public HistoryRoutineID: string | null = null;
    public HistoryRoutineName: string | null = null;
    public TotalCount = 0;
    public FilteredCount = 0;

    // ---------------------------------------------------------------
    // Navigation (public so hosts can drive the surface programmatically)
    // ---------------------------------------------------------------
    public ShowList(): void {
        this.setView('list');
        this.setSelectedRoutine(null);
    }

    public ShowNewRoutine(): void {
        this.EditingRoutineID = null;
        this.setView('editor');
    }

    public ShowEditRoutine(routine: MJUserRoutineEntity | string): void {
        this.EditingRoutineID = typeof routine === 'string' ? routine : routine.ID;
        this.setView('editor');
    }

    public ShowHistory(routine: MJUserRoutineEntity | string): void {
        if (typeof routine === 'string') {
            this.openHistoryById(routine);
        } else {
            this.HistoryRoutineID = routine.ID;
            this.HistoryRoutineName = routine.Name;
            this.setView('history');
            this.setSelectedRoutine(routine.ID);
        }
    }

    /** Force-refreshes the active view's data. */
    public async Refresh(): Promise<void> {
        if (this.ActiveView === 'history') {
            await this.history?.Refresh(true);
        } else {
            await this.list?.Refresh();
        }
    }

    // ---------------------------------------------------------------
    // Child wiring
    // ---------------------------------------------------------------
    public OnCountsChanged(counts: RoutineCounts): void {
        this.TotalCount = counts.Total;
        this.FilteredCount = counts.Filtered;
        this.CountsChanged.emit(counts);
        this.cdr.markForCheck();
    }

    public OnRoutineSelected(args: RoutineSelectedEventArgs): void {
        this.RoutineSelected.emit(args);
    }

    public OnHistoryRequested(routine: MJUserRoutineEntity): void {
        this.ShowHistory(routine);
    }

    public OnEditRequested(routine: MJUserRoutineEntity): void {
        this.ShowEditRoutine(routine);
    }

    public OnEditorSaved(_routine: MJUserRoutineEntity): void {
        this.ShowList();
    }

    public OnEditorCancelled(): void {
        this.ShowList();
    }

    public OnSearchChange(value: string): void {
        this.SearchText = value;
        this.cdr.markForCheck();
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------
    private setView(view: UserRoutinesView): void {
        if (this.ActiveView !== view) {
            this.ActiveView = view;
            this.ViewChanged.emit(view);
            this.cdr.markForCheck();
        }
    }

    private setSelectedRoutine(routineId: string | null): void {
        if (this._selectedRoutineID !== routineId) {
            this._selectedRoutineID = routineId;
            this.SelectedRoutineIDChange.emit(routineId);
        }
    }

    private openHistoryById(routineId: string): void {
        this.HistoryRoutineID = routineId;
        const p = this.ProviderToUse;
        const engine = UserRoutineEngine.GetProviderInstance<UserRoutineEngine>(p, UserRoutineEngine) as UserRoutineEngine;
        this.HistoryRoutineName = engine.GetRoutineByID(routineId)?.Name ?? null;
        this.setView('history');
        this.setSelectedRoutine(routineId);
    }
}
