import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { RecordChangeEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Record Changes.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-recordchange-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <kendo-textarea [(ngModel)]="record.RecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Changed At</label>
            <kendo-datepicker [(value)]="record.ChangedAt" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Changes JSON</label>
            <kendo-textbox [(ngModel)]="record.ChangesJSON"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Changes Description</label>
            <kendo-textbox [(ngModel)]="record.ChangesDescription"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full Record JSON</label>
            <kendo-textbox [(ngModel)]="record.FullRecordJSON"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <kendo-textbox [(ngModel)]="record.Status"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <kendo-textbox [(ngModel)]="record.Comments"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <span >{{FormatValue('RecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Changed At</label>
            <span >{{FormatValue('ChangedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Changes JSON</label>
            <span >{{FormatValue('ChangesJSON', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Changes Description</label>
            <span >{{FormatValue('ChangesDescription', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full Record JSON</label>
            <span >{{FormatValue('FullRecordJSON', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <span >{{FormatValue('Comments', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class RecordChangeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: RecordChangeEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadRecordChangeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
