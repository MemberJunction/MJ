import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { ContactEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Contacts.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-contact-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">First Name</label>
            <kendo-textbox [(ngModel)]="record.FirstName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Nick Name</label>
            <kendo-textbox [(ngModel)]="record.NickName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Last Name</label>
            <kendo-textbox [(ngModel)]="record.LastName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Account ID</label>
            <kendo-numerictextbox [(value)]="record.AccountID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Last Reviewed Date</label>
            <kendo-datepicker [(value)]="record.LastReviewedDate!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <kendo-textarea [(ngModel)]="record.Title" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Email 1</label>
            <kendo-textbox [(ngModel)]="record.Email1"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Email 2</label>
            <kendo-textbox [(ngModel)]="record.Email2"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Email Source</label>
            <kendo-textbox [(ngModel)]="record.EmailSource"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Phone Number</label>
            <kendo-textbox [(ngModel)]="record.PhoneNumber"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Profile Picture URL</label>
            <kendo-textarea [(ngModel)]="record.ProfilePictureURL" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Twitter</label>
            <kendo-textarea [(ngModel)]="record.Twitter" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Instagram</label>
            <kendo-textarea [(ngModel)]="record.Instagram" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Linked In</label>
            <kendo-textarea [(ngModel)]="record.LinkedIn" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Facebook</label>
            <kendo-textarea [(ngModel)]="record.Facebook" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Email Status</label>
            <kendo-textarea [(ngModel)]="record.EmailStatus" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Role ID</label>
            <kendo-numerictextbox [(value)]="record.RoleID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Level ID</label>
            <kendo-numerictextbox [(value)]="record.LevelID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Prefix</label>
            <kendo-textbox [(ngModel)]="record.Prefix"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Suffix</label>
            <kendo-textarea [(ngModel)]="record.Suffix" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Tags</label>
            <kendo-textbox [(ngModel)]="record.Tags"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <kendo-textbox [(ngModel)]="record.Status"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Activity Count</label>
            <kendo-numerictextbox [(value)]="record.ActivityCount" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Latest Activity Date</label>
            <kendo-datepicker [(value)]="record.LatestActivityDate!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Earliest Activity Date</label>
            <kendo-datepicker [(value)]="record.EarliestActivityDate!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record Source</label>
            <kendo-textbox [(ngModel)]="record.RecordSource"  />   
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
            <label class="fieldLabel">Last Enriched At</label>
            <kendo-datepicker [(value)]="record.LastEnrichedAt!" ></kendo-datepicker>   
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
            <label class="fieldLabel">First Name</label>
            <span >{{FormatValue('FirstName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Nick Name</label>
            <span >{{FormatValue('NickName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Last Name</label>
            <span >{{FormatValue('LastName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Account ID</label>
            <span mjFieldLink [record]="record" fieldName="AccountID" >{{FormatValue('AccountID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Last Reviewed Date</label>
            <span >{{FormatValue('LastReviewedDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <span >{{FormatValue('Title', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Email 1</label>
            <span >{{FormatValue('Email1', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Email 2</label>
            <span >{{FormatValue('Email2', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Email Source</label>
            <span >{{FormatValue('EmailSource', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Phone Number</label>
            <span >{{FormatValue('PhoneNumber', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Profile Picture URL</label>
            <span >{{FormatValue('ProfilePictureURL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Twitter</label>
            <span >{{FormatValue('Twitter', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Instagram</label>
            <span >{{FormatValue('Instagram', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Linked In</label>
            <span >{{FormatValue('LinkedIn', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Facebook</label>
            <span >{{FormatValue('Facebook', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Email Status</label>
            <span >{{FormatValue('EmailStatus', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Role ID</label>
            <span mjFieldLink [record]="record" fieldName="RoleID" >{{FormatValue('RoleID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Level ID</label>
            <span mjFieldLink [record]="record" fieldName="LevelID" >{{FormatValue('LevelID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Prefix</label>
            <span >{{FormatValue('Prefix', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Suffix</label>
            <span >{{FormatValue('Suffix', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Tags</label>
            <span >{{FormatValue('Tags', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Activity Count</label>
            <span >{{FormatValue('ActivityCount', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Latest Activity Date</label>
            <span >{{FormatValue('LatestActivityDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Earliest Activity Date</label>
            <span >{{FormatValue('EarliestActivityDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record Source</label>
            <span >{{FormatValue('RecordSource', 0)}}</span>
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
            <label class="fieldLabel">Last Enriched At</label>
            <span >{{FormatValue('LastEnrichedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Account</label>
            <span >{{FormatValue('Account', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ContactDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ContactEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadContactDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
