import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ConversationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Conversations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-conversation-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External ID</label>
            <kendo-textbox [(ngModel)]="record.ExternalID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <kendo-textbox [(ngModel)]="record.Type"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Archived</label>
            <input type="checkbox" [(ngModel)]="record.IsArchived" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Linked Entity ID</label>
            <kendo-numerictextbox [(value)]="record.LinkedEntityID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Linked Record ID</label>
            <kendo-numerictextbox [(value)]="record.LinkedRecordID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Data Context ID</label>
            <kendo-numerictextbox [(value)]="record.DataContextID!" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Linked Entity</label>
            <span >{{FormatValue('LinkedEntity', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External ID</label>
            <span >{{FormatValue('ExternalID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <span >{{FormatValue('Type', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Archived</label>
            <span >{{FormatValue('IsArchived', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Linked Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="LinkedEntityID" >{{FormatValue('LinkedEntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Linked Record ID</label>
            <span >{{FormatValue('LinkedRecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Data Context ID</label>
            <span >{{FormatValue('DataContextID', 0)}}</span>
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
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Linked Entity</label>
            <span >{{FormatValue('LinkedEntity', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ConversationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ConversationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadConversationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
