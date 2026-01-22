import { Component, Input, OnInit } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { ActionParamEntity } from '@memberjunction/core-entities';

@Component({
    selector: 'mj-action-param-dialog',
    templateUrl: './action-param-dialog.component.html',
    styleUrls: ['./action-param-dialog.component.css']
})
export class ActionParamDialogComponent implements OnInit {
    @Input() param!: ActionParamEntity;
    @Input() isNew: boolean = false;
    @Input() editMode: boolean = false;
    
    // Form fields
    public paramName: string = '';
    public paramType: 'Input' | 'Output' | 'Both' = 'Input';
    public valueType: 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other' | 'MediaOutput' = 'Scalar';
    public description: string = '';
    public defaultValue: string = '';
    public isRequired: boolean = false;
    public isArray: boolean = false;
    
    // Value type options
    public valueTypes = [
        { text: 'Scalar', value: 'Scalar' },
        { text: 'Simple Object', value: 'Simple Object' },
        { text: 'BaseEntity Sub-Class', value: 'BaseEntity Sub-Class' },
        { text: 'MediaOutput', value: 'MediaOutput' },
        { text: 'Other', value: 'Other' }
    ];
    
    public paramTypes = [
        { text: 'Input', value: 'Input' },
        { text: 'Output', value: 'Output' },
        { text: 'Both', value: 'Both' }
    ];
    
    constructor(
        public dialogRef: DialogRef
    ) {}
    
    ngOnInit() {
        if (this.param) {
            // Load existing values
            this.paramName = this.param.Name || '';
            this.paramType = this.param.Type as 'Input' | 'Output' | 'Both';
            this.valueType = this.param.ValueType || 'Scalar';
            this.description = this.param.Description || '';
            this.defaultValue = this.param.DefaultValue || '';
            this.isRequired = this.param.IsRequired || false;
            this.isArray = this.param.IsArray || false;
        }
    }
    
    save() {
        // Update the param entity with form values
        this.param.Name = this.paramName;
        this.param.Type = this.paramType;
        this.param.ValueType = this.valueType;
        this.param.Description = this.description;
        this.param.DefaultValue = this.defaultValue;
        this.param.IsRequired = this.isRequired;
        this.param.IsArray = this.isArray;
        
        // Close dialog and pass back the updated param
        this.dialogRef.close({ param: this.param, save: true });
    }
    
    cancel() {
        this.dialogRef.close({ save: false });
    }
}