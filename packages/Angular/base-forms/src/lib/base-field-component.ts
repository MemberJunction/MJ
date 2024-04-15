import { Component, Input, Output, EventEmitter } from '@angular/core';
import { BaseEntity, EntityFieldTSType } from '@memberjunction/core';
import { BaseRecordComponent } from './base-record-component';


@Component({
    selector: 'mj-form-field',
    styleUrl: './base-field-component.css',
    templateUrl: './base-field-component.html'
})
export class MJFormField extends BaseRecordComponent {
    @Input() record!: BaseEntity;
    @Input() EditMode: boolean = false;
    @Input() FieldName: string = '';
    @Input() Type: 'textbox' | 'textarea' | 'numerictextbox' | 'datepicker' | 'checkbox' | 'dropdownlist' | 'combobox' = 'textbox';
    @Input() LinkType: 'Email' | 'URL' | 'Record' | 'None' = 'None';
    
    private _displayName: string | null = null;
    @Input() 
    public get DisplayName(): string {
        if (!this._displayName) {
            const ef = this.record.Fields.find(f => f.Name == this.FieldName)?.EntityFieldInfo;
            if (ef)
                this._displayName = ef.DisplayNameOrName;
            else
                this._displayName = this.FieldName;
        }
        return this._displayName;
    }
    // use the custom value
    public set DisplayName(newValue: string) {
        this._displayName = newValue;
    }

    private _possibleValues: string[] | null = null;
    @Input() get PossibleValues(): string[] {
        if (!this._possibleValues) {
            const ef = this.record.Fields.find(f => f.Name == this.FieldName)?.EntityFieldInfo;
            if (ef && ef.ValueListType !== 'None')
                this._possibleValues = ef.EntityFieldValues.map(v => v.Value);
            else
                this._possibleValues = [];
        }
        return this._possibleValues;
    }
    // use the custom value if provided
    set PossibleValues(newValue: string[]) {
        this._possibleValues = newValue;
    }

    @Input()
    public get Value(): any {
        const v = this.record.Get(this.FieldName);
        const f = this.record.Fields.find(f => f.Name == this.FieldName);
        if (v === null || v === undefined) {
            // check to see if this is a text type of field
            if (f?.EntityFieldInfo.TSType === EntityFieldTSType.String)
                return '';
        }

        // get here, return the value as it is
        return v;
    }
    public set Value(newValue: any) {
        if (!this.IsFieldReadOnly) {
            this.record.Set(this.FieldName, newValue);
            this.ValueChange.emit(newValue);    
        }
        // ignore this if it is read only
    }
    @Output() ValueChange = new EventEmitter<any>();

    public get IsFieldReadOnly(): boolean {
        const f = this.record.Fields.find(f => f.Name == this.FieldName);
        if (f)
            return f.ReadOnly;
        else
            throw new Error(`Field ${this.FieldName} not found in record ${this.record.EntityInfo.Name}`);
    }
}
