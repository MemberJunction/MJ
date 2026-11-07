import { Component, Input, Output, EventEmitter, OnInit, ViewChild, ChangeDetectorRef, inject } from '@angular/core';
import { MJActionEntity, MJActionParamEntity } from '@memberjunction/core-entities';
import { ActionResult, ActionTestHarnessComponent } from '../action-test-harness/action-test-harness.component';

/**
 * A dialog wrapper component for the Action Test Harness, built on the shared mj-dialog
 * (700px on desktop, full-screen on phones; it also locks page scroll while open).
 *
 * Usage:
 * <mj-action-test-harness-dialog
 *   [Action]="myAction"
 *   [ActionParams]="myParams"
 *   [IsOpen]="showDialog"
 *   (Close)="onDialogClose()"
 *   (ExecutionComplete)="onExecutionComplete($event)">
 * </mj-action-test-harness-dialog>
 */
@Component({
  standalone: false,
    selector: 'mj-action-test-harness-dialog',
    templateUrl: './action-test-harness-dialog.component.html',
    styleUrls: ['./action-test-harness-dialog.component.css']
})
export class ActionTestHarnessDialogComponent implements OnInit {
    // Private backing fields
    private _action!: MJActionEntity;
    private _actionParams: MJActionParamEntity[] = [];
    private _isOpen = false;

    @Input()
    set Action(value: MJActionEntity) {
        this._action = value;
    }
    get Action(): MJActionEntity {
        return this._action;
    }

    @Input()
    set ActionParams(value: MJActionParamEntity[]) {
        this._actionParams = value || [];
    }
    get ActionParams(): MJActionParamEntity[] {
        return this._actionParams;
    }

    @Input()
    set IsOpen(value: boolean) {
        this._isOpen = value;
    }
    get IsOpen(): boolean {
        return this._isOpen;
    }

    @Output() Close = new EventEmitter<void>();
    @Output() ExecutionComplete = new EventEmitter<ActionResult>();

    ngOnInit(): void {
        // Any initialization if needed
    }

    private readonly cdr = inject(ChangeDetectorRef);

    /** The harness inside the dialog; the footer's buttons drive it. */
    @ViewChild(ActionTestHarnessComponent) Harness?: ActionTestHarnessComponent;

    /**
     * Footer state. Each getter falls back to the harness's own starting values (not running, no
     * results) until the harness exists, so the first render and Angular's check pass agree.
     */
    public get IsRunning(): boolean {
        return !!this.Harness?.IsExecuting;
    }

    public get CanRun(): boolean {
        return this.Action?.Status === 'Active' && !this.IsRunning;
    }

    public get HasResults(): boolean {
        return !!(this.Harness?.ExecutionResult || this.Harness?.ExecutionError);
    }

    public RunAction(): void {
        void this.Harness?.ExecuteAction();
    }

    public ResetHarness(): void {
        this.Harness?.ResetParams();
    }

    public ClearHarnessResults(): void {
        this.Harness?.ClearResults();
    }

    /** The harness started or finished a run, or cleared its results: refresh the footer. */
    public OnHarnessStateChange(): void {
        this.cdr.markForCheck();
    }

    /** The dialog title: the action's name once it is bound. */
    public get DialogTitle(): string {
        return this.Action ? `Action Test Harness - ${this.Action.Name}` : 'Action Test Harness';
    }

    public OnClose(): void {
        this.IsOpen = false;
        this.Close.emit();
    }


    public OnExecutionComplete(result: ActionResult): void {
        this.ExecutionComplete.emit(result);
    }
}