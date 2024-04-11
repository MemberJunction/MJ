import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { QueueTaskEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Queue Tasks.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-queuetask-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Queue ID</label>
            <kendo-numerictextbox [(value)]="record.QueueID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <kendo-dropdownlist [data]="['In Progress', 'Completed', 'Failed']" [(ngModel)]="record.Status" ></kendo-dropdownlist>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Started At</label>
            <kendo-datepicker [(value)]="record.StartedAt!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Ended At</label>
            <kendo-datepicker [(value)]="record.EndedAt!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Data</label>
            <kendo-textbox [(ngModel)]="record.Data"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Options</label>
            <kendo-textbox [(ngModel)]="record.Options"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output</label>
            <kendo-textbox [(ngModel)]="record.Output"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Error Message</label>
            <kendo-textbox [(ngModel)]="record.ErrorMessage"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <kendo-textbox [(ngModel)]="record.Comments"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Queue</label>
            <span >{{FormatValue('Queue', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Queue ID</label>
            <span mjFieldLink [record]="record" fieldName="QueueID" >{{FormatValue('QueueID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Started At</label>
            <span >{{FormatValue('StartedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Ended At</label>
            <span >{{FormatValue('EndedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Data</label>
            <span >{{FormatValue('Data', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Options</label>
            <span >{{FormatValue('Options', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output</label>
            <span >{{FormatValue('Output', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Error Message</label>
            <span >{{FormatValue('ErrorMessage', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <span >{{FormatValue('Comments', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Queue</label>
            <span >{{FormatValue('Queue', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class QueueTaskDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: QueueTaskEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadQueueTaskDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      