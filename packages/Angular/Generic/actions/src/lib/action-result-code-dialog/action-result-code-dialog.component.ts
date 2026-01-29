import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ActionResultCodeEntity } from '@memberjunction/core-entities';

export interface ActionResultCodeDialogResult {
    ResultCode: ActionResultCodeEntity;
    Save: boolean;
}

/**
 * A dialog component for editing action result codes.
 * This component provides a form for creating and editing action result codes.
 *
 * Usage:
 * <mj-action-result-code-dialog
 *   [ResultCode]="myResultCode"
 *   [IsNew]="false"
 *   [EditMode]="true"
 *   [IsOpen]="showDialog"
 *   (Close)="onDialogClose($event)">
 * </mj-action-result-code-dialog>
 */
@Component({
    selector: 'mj-action-result-code-dialog',
    templateUrl: './action-result-code-dialog.component.html',
    styleUrls: ['./action-result-code-dialog.component.css']
})
export class ActionResultCodeDialogComponent implements OnInit {
    // Private backing fields
    private _resultCode!: ActionResultCodeEntity;
    private _isNew = false;
    private _editMode = false;
    private _isOpen = false;

    @Input()
    set ResultCode(value: ActionResultCodeEntity) {
        this._resultCode = value;
        if (value) {
            this.loadResultCodeValues();
        }
    }
    get ResultCode(): ActionResultCodeEntity {
        return this._resultCode;
    }

    @Input()
    set IsNew(value: boolean) {
        this._isNew = value;
    }
    get IsNew(): boolean {
        return this._isNew;
    }

    @Input()
    set EditMode(value: boolean) {
        this._editMode = value;
    }
    get EditMode(): boolean {
        return this._editMode;
    }

    @Input()
    set IsOpen(value: boolean) {
        this._isOpen = value;
        if (value) {
            document.body.style.overflow = 'hidden';
            this.loadResultCodeValues();
        } else {
            document.body.style.overflow = '';
        }
    }
    get IsOpen(): boolean {
        return this._isOpen;
    }

    @Output() Close = new EventEmitter<ActionResultCodeDialogResult>();

    // Form fields
    public Code = '';
    public Description = '';
    public IsSuccess = false;

    ngOnInit(): void {
        this.loadResultCodeValues();
    }

    private loadResultCodeValues(): void {
        if (this._resultCode) {
            this.Code = this._resultCode.ResultCode || '';
            this.Description = this._resultCode.Description || '';
            this.IsSuccess = this._resultCode.IsSuccess || false;
        }
    }

    public OnSave(): void {
        // Update the result code entity with form values
        this._resultCode.ResultCode = this.Code;
        this._resultCode.Description = this.Description;
        this._resultCode.IsSuccess = this.IsSuccess;

        // Close dialog and pass back the result
        this.IsOpen = false;
        this.Close.emit({ ResultCode: this._resultCode, Save: true });
    }

    public OnCancel(): void {
        this.IsOpen = false;
        this.Close.emit({ ResultCode: this._resultCode, Save: false });
    }

    public OnBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
            this.OnCancel();
        }
    }

    public get CanSave(): boolean {
        return !!this.Code && this.Code.trim().length > 0;
    }
}

// Tree-shaking prevention function
export function LoadActionResultCodeDialogComponent(): void {
    // This function ensures the component is included in the bundle
}
