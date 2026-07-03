import { ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
import { UserRoutinesCommandCenterComponent } from './user-routines-command-center.component';

/**
 * Slide-in wrapper for the User Routines command center — the standard right-edge
 * panel (via `mj-slide-panel` from `@memberjunction/ng-ui-components`) hosting the
 * full command center (list / new / history). Used by ng-conversations' sidebar
 * routines section and any other host that wants the drop-in overlay experience.
 *
 * Two-way bind `[(Visible)]`; all command-center events bubble unchanged.
 */
@Component({
    standalone: false,
    selector: 'mj-user-routines-slide-in',
    templateUrl: './user-routines-slide-in.component.html',
    styleUrls: ['./user-routines-slide-in.component.css'],
})
export class UserRoutinesSlideInComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    @ViewChild('commandCenter') private commandCenter?: UserRoutinesCommandCenterComponent;

    // ---------------------------------------------------------------
    // Inputs
    // ---------------------------------------------------------------
    private _visible = false;
    /** Whether the slide-in is open. Two-way bindable: `[(Visible)]`. */
    @Input()
    public set Visible(value: boolean) {
        if (value !== this._visible) {
            this._visible = value;
            this.cdr.markForCheck();
            if (value) {
                // Declarative open ([(Visible)] binding) must honor InitialRoutineID /
                // StartInNewRoutine exactly like the imperative Open() path. The command
                // center mounts via @if — apply the initial view next tick.
                Promise.resolve().then(() => this.applyInitialView());
            }
        }
    }
    public get Visible(): boolean {
        return this._visible;
    }

    /** Initial panel width in pixels. */
    @Input() WidthPx = 720;

    /**
     * When set, the command center opens directly on this routine's history each time
     * the slide-in becomes visible with the value set.
     */
    @Input() InitialRoutineID: string | null = null;

    /** When true, the command center opens directly on the New Routine editor. */
    @Input() StartInNewRoutine = false;

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    @Output() VisibleChange = new EventEmitter<boolean>();
    /** The panel was closed (X, backdrop, or Escape). */
    @Output() Closed = new EventEmitter<void>();

    // Bubbled command-center events
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
    /** Re-emitted — the routine's dedicated conversation was requested. */
    @Output() ConversationOpened = new EventEmitter<ConversationOpenedEventArgs>();

    /** Opens the slide-in (optionally straight onto a routine's history or the editor). */
    public Open(options?: { RoutineID?: string; NewRoutine?: boolean }): void {
        this.InitialRoutineID = options?.RoutineID ?? null;
        this.StartInNewRoutine = options?.NewRoutine ?? false;
        this._visible = true;
        this.VisibleChange.emit(true);
        this.cdr.markForCheck();
        // The command center mounts via @if — apply the initial view next tick
        Promise.resolve().then(() => this.applyInitialView());
    }

    /** Closes the slide-in. */
    public Close(): void {
        if (this._visible) {
            this._visible = false;
            this.VisibleChange.emit(false);
            this.Closed.emit();
            this.cdr.markForCheck();
        }
    }

    public OnPanelClosed(): void {
        this.Close();
    }

    /** Applies InitialRoutineID / StartInNewRoutine once the command center is mounted. */
    public applyInitialView(): void {
        const cc = this.commandCenter;
        if (!cc) {
            return;
        }
        if (this.StartInNewRoutine) {
            cc.ShowNewRoutine();
        } else if (this.InitialRoutineID) {
            cc.ShowHistory(this.InitialRoutineID);
        }
    }
}
