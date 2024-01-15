import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { RecordMergeDeletionLogEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Record Merge Deletion Logs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-recordmergedeletionlog-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Record Merge Log ID</label>
            <kendo-numerictextbox [(value)]="record.RecordMergeLogID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Deleted Record ID</label>
            <kendo-textarea [(ngModel)]="record.DeletedRecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <kendo-textbox [(ngModel)]="record.Status"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Processing Log</label>
            <kendo-textbox [(ngModel)]="record.ProcessingLog"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Record Merge Log ID</label>
            <span mjFieldLink [record]="record" fieldName="RecordMergeLogID" >{{FormatValue('RecordMergeLogID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Deleted Record ID</label>
            <span >{{FormatValue('DeletedRecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Processing Log</label>
            <span >{{FormatValue('ProcessingLog', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class RecordMergeDeletionLogDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: RecordMergeDeletionLogEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadRecordMergeDeletionLogDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
