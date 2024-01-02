import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { ConversationDetailEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Conversation Details.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-conversationdetail-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Conversation ID</label>
            <kendo-numerictextbox [(value)]="record.ConversationID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External ID</label>
            <kendo-textbox [(ngModel)]="record.ExternalID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Role</label>
            <kendo-textbox [(ngModel)]="record.Role"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Message</label>
            <kendo-textbox [(ngModel)]="record.Message"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Error</label>
            <kendo-textbox [(ngModel)]="record.Error"  />   
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
            <label class="fieldLabel">Conversation</label>
            <span >{{FormatValue('Conversation', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Conversation ID</label>
            <span mjFieldLink [record]="record" fieldName="ConversationID" >{{FormatValue('ConversationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External ID</label>
            <span >{{FormatValue('ExternalID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Role</label>
            <span >{{FormatValue('Role', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Message</label>
            <span >{{FormatValue('Message', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Error</label>
            <span >{{FormatValue('Error', 0)}}</span>
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
            <label class="fieldLabel">Conversation</label>
            <span >{{FormatValue('Conversation', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ConversationDetailDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: ConversationDetailEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadConversationDetailDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
