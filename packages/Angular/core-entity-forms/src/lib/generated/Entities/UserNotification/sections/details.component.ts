import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { UserNotificationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'User Notifications.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-usernotification-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <kendo-textarea [(ngModel)]="record.Title" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Message</label>
            <kendo-textbox [(ngModel)]="record.Message"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Resource Type ID</label>
            <kendo-numerictextbox [(value)]="record.ResourceTypeID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Resource Record ID</label>
            <kendo-numerictextbox [(value)]="record.ResourceRecordID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Resource Configuration</label>
            <kendo-textbox [(ngModel)]="record.ResourceConfiguration"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Unread</label>
            <input type="checkbox" [(ngModel)]="record.Unread" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Read At</label>
            <kendo-datepicker [(value)]="record.ReadAt!" ></kendo-datepicker>   
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
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <span >{{FormatValue('Title', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Message</label>
            <span >{{FormatValue('Message', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Resource Type ID</label>
            <span >{{FormatValue('ResourceTypeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Resource Record ID</label>
            <span >{{FormatValue('ResourceRecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Resource Configuration</label>
            <span >{{FormatValue('ResourceConfiguration', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Unread</label>
            <span >{{FormatValue('Unread', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Read At</label>
            <span >{{FormatValue('ReadAt', 0)}}</span>
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
    </div>
</div>
    `
})
export class UserNotificationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: UserNotificationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadUserNotificationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
