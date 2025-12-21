import { Component, Input, OnInit } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { ActionResultCodeEntity } from '@memberjunction/core-entities';

@Component({
  standalone: false,
    selector: 'mj-action-result-code-dialog',
    templateUrl: './action-result-code-dialog.component.html',
    styleUrls: ['./action-result-code-dialog.component.css']
})
export class ActionResultCodeDialogComponent implements OnInit {
    @Input() resultCode!: ActionResultCodeEntity;
    @Input() isNew: boolean = false;
    @Input() editMode: boolean = false;
    
    // Form fields
    public code: string = '';
    public description: string = '';
    public isSuccess: boolean = false;
    
    constructor(
        public dialogRef: DialogRef
    ) {}
    
    ngOnInit() {
        if (this.resultCode) {
            // Load existing values
            this.code = this.resultCode.ResultCode || '';
            this.description = this.resultCode.Description || '';
            this.isSuccess = this.resultCode.IsSuccess || false;
        }
    }
    
    save() {
        // Update the result code entity with form values
        this.resultCode.ResultCode = this.code;
        this.resultCode.Description = this.description;
        this.resultCode.IsSuccess = this.isSuccess;
        
        // Close dialog and pass back the updated result code
        this.dialogRef.close({ resultCode: this.resultCode, save: true });
    }
    
    cancel() {
        this.dialogRef.close({ save: false });
    }
}