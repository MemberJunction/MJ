import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { ActionParamEntity } from '@memberjunction/core-entities';

export interface ActionParamDialogResult {
    Param: ActionParamEntity;
    Save: boolean;
}

/**
 * A dialog component for editing action parameters.
 * This component provides a form for creating and editing action parameters.
 *
 * Usage:
 * <mj-action-param-dialog
 *   [Param]="myParam"
 *   [IsNew]="false"
 *   [EditMode]="true"
 *   [IsOpen]="showDialog"
 *   (Close)="onDialogClose($event)">
 * </mj-action-param-dialog>
 */
@Component({
  standalone: false,
    selector: 'mj-action-param-dialog',
    templateUrl: './action-param-dialog.component.html',
    styleUrls: ['./action-param-dialog.component.css']
})
export class ActionParamDialogComponent implements OnInit {
    // Private backing fields
    private _param!: ActionParamEntity;
    private _isNew = false;
    private _editMode = false;
    private _isOpen = false;

    @Input()
    set Param(value: ActionParamEntity) {
        this._param = value;
        if (value) {
            this.loadParamValues();
        }
    }
    get Param(): ActionParamEntity {
        return this._param;
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
            this.loadParamValues();
        } else {
            document.body.style.overflow = '';
        }
    }
    get IsOpen(): boolean {
        return this._isOpen;
    }

    @Output() Close = new EventEmitter<ActionParamDialogResult>();

    // Form fields
    public ParamName = '';
    public ParamType: 'Input' | 'Output' | 'Both' = 'Input';
    public ValueType: 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other' | 'MediaOutput' = 'Scalar';
    public Description = '';
    public DefaultValue = '';
    public IsRequired = false;
    public IsArray = false;

    // Value type options
    public ValueTypes = [
        { Text: 'Scalar', Value: 'Scalar' },
        { Text: 'Simple Object', Value: 'Simple Object' },
        { Text: 'BaseEntity Sub-Class', Value: 'BaseEntity Sub-Class' },
        { Text: 'MediaOutput', Value: 'MediaOutput' },
        { Text: 'Other', Value: 'Other' }
    ];

    public ParamTypes = [
        { Text: 'Input', Value: 'Input' },
        { Text: 'Output', Value: 'Output' },
        { Text: 'Both', Value: 'Both' }
    ];

    ngOnInit(): void {
        this.loadParamValues();
    }

    private loadParamValues(): void {
        if (this._param) {
            this.ParamName = this._param.Name || '';
            this.ParamType = this._param.Type as 'Input' | 'Output' | 'Both';
            this.ValueType = (this._param.ValueType as typeof this.ValueType) || 'Scalar';
            this.Description = this._param.Description || '';
            this.DefaultValue = this._param.DefaultValue || '';
            this.IsRequired = this._param.IsRequired || false;
            this.IsArray = this._param.IsArray || false;
        }
    }

    public OnSave(): void {
        // Update the param entity with form values
        this._param.Name = this.ParamName;
        this._param.Type = this.ParamType;
        this._param.ValueType = this.ValueType;
        this._param.Description = this.Description;
        this._param.DefaultValue = this.DefaultValue;
        this._param.IsRequired = this.IsRequired;
        this._param.IsArray = this.IsArray;

        // Close dialog and pass back the result
        this.IsOpen = false;
        this.Close.emit({ Param: this._param, Save: true });
    }

    public OnCancel(): void {
        this.IsOpen = false;
        this.Close.emit({ Param: this._param, Save: false });
    }

    public OnBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
            this.OnCancel();
        }
    }

    public GetTypeClass(type: string): string {
        return 'type-' + type.toLowerCase();
    }
}

// Tree-shaking prevention function
export function LoadActionParamDialogComponent(): void {
    // This function ensures the component is included in the bundle
}
