import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { QueueEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Queues.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-queue-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Queue Type ID</label>
            <kendo-numerictextbox [(value)]="record.QueueTypeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process PID</label>
            <kendo-numerictextbox [(value)]="record.ProcessPID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process Platform</label>
            <kendo-textbox [(ngModel)]="record.ProcessPlatform"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process Version</label>
            <kendo-textbox [(ngModel)]="record.ProcessVersion"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process Cwd</label>
            <kendo-textbox [(ngModel)]="record.ProcessCwd"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process IPAddress</label>
            <kendo-textbox [(ngModel)]="record.ProcessIPAddress"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process Mac Address</label>
            <kendo-textbox [(ngModel)]="record.ProcessMacAddress"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process OSName</label>
            <kendo-textbox [(ngModel)]="record.ProcessOSName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process OSVersion</label>
            <kendo-textbox [(ngModel)]="record.ProcessOSVersion"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process Host Name</label>
            <kendo-textbox [(ngModel)]="record.ProcessHostName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process User ID</label>
            <kendo-textbox [(ngModel)]="record.ProcessUserID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Process User Name</label>
            <kendo-textbox [(ngModel)]="record.ProcessUserName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Last Heartbeat</label>
            <kendo-datepicker [(value)]="record.LastHeartbeat" ></kendo-datepicker>   
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
            <label class="fieldLabel">Queue Type</label>
            <span >{{FormatValue('QueueType', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Queue Type ID</label>
            <span mjFieldLink [record]="record" fieldName="QueueTypeID" >{{FormatValue('QueueTypeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process PID</label>
            <span >{{FormatValue('ProcessPID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process Platform</label>
            <span >{{FormatValue('ProcessPlatform', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process Version</label>
            <span >{{FormatValue('ProcessVersion', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process Cwd</label>
            <span >{{FormatValue('ProcessCwd', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process IPAddress</label>
            <span >{{FormatValue('ProcessIPAddress', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process Mac Address</label>
            <span >{{FormatValue('ProcessMacAddress', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process OSName</label>
            <span >{{FormatValue('ProcessOSName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process OSVersion</label>
            <span >{{FormatValue('ProcessOSVersion', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process Host Name</label>
            <span >{{FormatValue('ProcessHostName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process User ID</label>
            <span >{{FormatValue('ProcessUserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Process User Name</label>
            <span >{{FormatValue('ProcessUserName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Last Heartbeat</label>
            <span >{{FormatValue('LastHeartbeat', 0)}}</span>
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
            <label class="fieldLabel">Queue Type</label>
            <span >{{FormatValue('QueueType', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class QueueDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: QueueEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadQueueDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      