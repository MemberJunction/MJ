import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { RecordMergeLogEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Record Merge Logs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-recordmergelog-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Surviving Record ID</label>
            <kendo-textarea [(ngModel)]="record.SurvivingRecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Initiated By User ID</label>
            <kendo-numerictextbox [(value)]="record.InitiatedByUserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Approval Status</label>
            <kendo-dropdownlist [data]="['Pending', 'Approved', 'Rejected']" [(ngModel)]="record.ApprovalStatus" ></kendo-dropdownlist>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Approved By User ID</label>
            <kendo-numerictextbox [(value)]="record.ApprovedByUserID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Processing Status</label>
            <kendo-dropdownlist [data]="['Started', 'Complete', 'Error']" [(ngModel)]="record.ProcessingStatus" ></kendo-dropdownlist>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Processing Started At</label>
            <kendo-datepicker [(value)]="record.ProcessingStartedAt" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Processing Ended At</label>
            <kendo-datepicker [(value)]="record.ProcessingEndedAt!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Processing Log</label>
            <kendo-textbox [(ngModel)]="record.ProcessingLog"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <kendo-textbox [(ngModel)]="record.Comments"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Initiated By User</label>
            <span >{{FormatValue('InitiatedByUser', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Surviving Record ID</label>
            <span >{{FormatValue('SurvivingRecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Initiated By User ID</label>
            <span mjFieldLink [record]="record" fieldName="InitiatedByUserID" >{{FormatValue('InitiatedByUserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Approval Status</label>
            <span >{{FormatValue('ApprovalStatus', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Approved By User ID</label>
            <span >{{FormatValue('ApprovedByUserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Processing Status</label>
            <span >{{FormatValue('ProcessingStatus', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Processing Started At</label>
            <span >{{FormatValue('ProcessingStartedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Processing Ended At</label>
            <span >{{FormatValue('ProcessingEndedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Processing Log</label>
            <span >{{FormatValue('ProcessingLog', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <span >{{FormatValue('Comments', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Initiated By User</label>
            <span >{{FormatValue('InitiatedByUser', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class RecordMergeLogDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: RecordMergeLogEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadRecordMergeLogDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
