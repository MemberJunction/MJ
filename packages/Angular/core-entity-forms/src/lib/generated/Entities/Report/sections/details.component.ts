import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { ReportEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Reports.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-report-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textarea [(ngModel)]="record.Name" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Category ID</label>
            <kendo-numerictextbox [(value)]="record.CategoryID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sharing Scope</label>
            <kendo-textbox [(ngModel)]="record.SharingScope"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Conversation ID</label>
            <kendo-numerictextbox [(value)]="record.ConversationID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Conversation Detail ID</label>
            <kendo-numerictextbox [(value)]="record.ConversationDetailID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Data Context ID</label>
            <kendo-numerictextbox [(value)]="record.DataContextID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Configuration</label>
            <kendo-textbox [(ngModel)]="record.Configuration"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Trigger Type ID</label>
            <kendo-numerictextbox [(value)]="record.OutputTriggerTypeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Format Type ID</label>
            <kendo-numerictextbox [(value)]="record.OutputFormatTypeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Delivery Type ID</label>
            <kendo-numerictextbox [(value)]="record.OutputDeliveryTypeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Event ID</label>
            <kendo-numerictextbox [(value)]="record.OutputEventID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Frequency</label>
            <kendo-textbox [(ngModel)]="record.OutputFrequency"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Target Email</label>
            <kendo-textarea [(ngModel)]="record.OutputTargetEmail" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Workflow ID</label>
            <kendo-numerictextbox [(value)]="record.OutputWorkflowID" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Conversation</label>
            <span >{{FormatValue('Conversation', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Data Context</label>
            <span >{{FormatValue('DataContext', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Trigger Type</label>
            <span >{{FormatValue('OutputTriggerType', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Format Type</label>
            <span >{{FormatValue('OutputFormatType', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Delivery Type</label>
            <span >{{FormatValue('OutputDeliveryType', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Event</label>
            <span >{{FormatValue('OutputEvent', 0)}}</span>   
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
            <label class="fieldLabel">Category ID</label>
            <span mjFieldLink [record]="record" fieldName="CategoryID" >{{FormatValue('CategoryID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sharing Scope</label>
            <span >{{FormatValue('SharingScope', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Conversation ID</label>
            <span mjFieldLink [record]="record" fieldName="ConversationID" >{{FormatValue('ConversationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Conversation Detail ID</label>
            <span mjFieldLink [record]="record" fieldName="ConversationDetailID" >{{FormatValue('ConversationDetailID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Data Context ID</label>
            <span mjFieldLink [record]="record" fieldName="DataContextID" >{{FormatValue('DataContextID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Configuration</label>
            <span >{{FormatValue('Configuration', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Trigger Type ID</label>
            <span mjFieldLink [record]="record" fieldName="OutputTriggerTypeID" >{{FormatValue('OutputTriggerTypeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Format Type ID</label>
            <span mjFieldLink [record]="record" fieldName="OutputFormatTypeID" >{{FormatValue('OutputFormatTypeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Delivery Type ID</label>
            <span mjFieldLink [record]="record" fieldName="OutputDeliveryTypeID" >{{FormatValue('OutputDeliveryTypeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Event ID</label>
            <span mjFieldLink [record]="record" fieldName="OutputEventID" >{{FormatValue('OutputEventID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Frequency</label>
            <span >{{FormatValue('OutputFrequency', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Target Email</label>
            <span >{{FormatValue('OutputTargetEmail', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Workflow ID</label>
            <span mjFieldLink [record]="record" fieldName="OutputWorkflowID" >{{FormatValue('OutputWorkflowID', 0)}}</span>
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
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Conversation</label>
            <span >{{FormatValue('Conversation', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Data Context</label>
            <span >{{FormatValue('DataContext', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Trigger Type</label>
            <span >{{FormatValue('OutputTriggerType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Format Type</label>
            <span >{{FormatValue('OutputFormatType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Delivery Type</label>
            <span >{{FormatValue('OutputDeliveryType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Event</label>
            <span >{{FormatValue('OutputEvent', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ReportDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ReportEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadReportDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
