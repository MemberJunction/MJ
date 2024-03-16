import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { ActivityEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Activities.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-activity-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <kendo-numerictextbox [(value)]="record.EmployeeID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Contact ID</label>
            <kendo-numerictextbox [(value)]="record.ContactID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Account ID</label>
            <kendo-numerictextbox [(value)]="record.AccountID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Deal ID</label>
            <kendo-numerictextbox [(value)]="record.DealID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Activity Date</label>
            <kendo-datepicker [(value)]="record.ActivityDate!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
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
            <label class="fieldLabel">Attachment</label>
            <kendo-textarea [(ngModel)]="record.Attachment" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Record ID</label>
            <kendo-textbox [(ngModel)]="record.ExternalSystemRecordID"  />   
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
            <label class="fieldLabel">Attachment ID</label>
            <kendo-numerictextbox [(value)]="record.AttachmentID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <kendo-textarea [(ngModel)]="record.Title" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Opened</label>
            <input type="checkbox" [(ngModel)]="record.IsOpened" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Bounced</label>
            <input type="checkbox" [(ngModel)]="record.IsBounced" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Replied</label>
            <input type="checkbox" [(ngModel)]="record.IsReplied" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Summary</label>
            <kendo-textbox [(ngModel)]="record.Summary"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Account</label>
            <span >{{FormatValue('Account', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <span mjFieldLink [record]="record" fieldName="EmployeeID" >{{FormatValue('EmployeeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Contact ID</label>
            <span mjFieldLink [record]="record" fieldName="ContactID" >{{FormatValue('ContactID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Account ID</label>
            <span mjFieldLink [record]="record" fieldName="AccountID" >{{FormatValue('AccountID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Deal ID</label>
            <span mjFieldLink [record]="record" fieldName="DealID" >{{FormatValue('DealID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Activity Date</label>
            <span >{{FormatValue('ActivityDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
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
            <label class="fieldLabel">Attachment</label>
            <span >{{FormatValue('Attachment', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationID" >{{FormatValue('CompanyIntegrationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Record ID</label>
            <span >{{FormatValue('ExternalSystemRecordID', 0)}}</span>
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
            <label class="fieldLabel">Attachment ID</label>
            <span mjFieldLink [record]="record" fieldName="AttachmentID" >{{FormatValue('AttachmentID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <span >{{FormatValue('Title', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Opened</label>
            <span >{{FormatValue('IsOpened', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Bounced</label>
            <span >{{FormatValue('IsBounced', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Replied</label>
            <span >{{FormatValue('IsReplied', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Summary</label>
            <span >{{FormatValue('Summary', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Account</label>
            <span >{{FormatValue('Account', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ActivityDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ActivityEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadActivityDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
