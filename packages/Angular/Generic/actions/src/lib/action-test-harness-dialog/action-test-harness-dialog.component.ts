import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ActionEntity, ActionParamEntity } from '@memberjunction/core-entities';
import { ActionResult } from '../action-test-harness/action-test-harness.component';

/**
 * A dialog wrapper component for the Action Test Harness.
 * This component provides a modal dialog experience without Kendo dependencies.
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
    selector: 'mj-action-test-harness-dialog',
    templateUrl: './action-test-harness-dialog.component.html',
    styleUrls: ['./action-test-harness-dialog.component.css']
})
export class ActionTestHarnessDialogComponent implements OnInit {
    // Private backing fields
    private _action!: ActionEntity;
    private _actionParams: ActionParamEntity[] = [];
    private _isOpen = false;

    @Input()
    set Action(value: ActionEntity) {
        this._action = value;
    }
    get Action(): ActionEntity {
        return this._action;
    }

    @Input()
    set ActionParams(value: ActionParamEntity[]) {
        this._actionParams = value || [];
    }
    get ActionParams(): ActionParamEntity[] {
        return this._actionParams;
    }

    @Input()
    set IsOpen(value: boolean) {
        this._isOpen = value;
        if (value) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
    get IsOpen(): boolean {
        return this._isOpen;
    }

    @Output() Close = new EventEmitter<void>();
    @Output() ExecutionComplete = new EventEmitter<ActionResult>();

    ngOnInit(): void {
        // Any initialization if needed
    }

    public OnClose(): void {
        this.IsOpen = false;
        this.Close.emit();
    }

    public OnBackdropClick(event: MouseEvent): void {
        // Only close if clicking directly on backdrop, not on dialog content
        if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
            this.OnClose();
        }
    }

    public OnExecutionComplete(result: ActionResult): void {
        this.ExecutionComplete.emit(result);
    }
}

// Tree-shaking prevention function
export function LoadActionTestHarnessDialogComponent(): void {
    // This function ensures the component is included in the bundle
}
