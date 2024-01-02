import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { UserRecordLogEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'User Record Logs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-userrecordlog-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <kendo-numerictextbox [(value)]="record.RecordID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Earliest At</label>
            <kendo-datepicker [(value)]="record.EarliestAt" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Latest At</label>
            <kendo-datepicker [(value)]="record.LatestAt" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Total Count</label>
            <kendo-numerictextbox [(value)]="record.TotalCount" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User Name</label>
            <span >{{FormatValue('UserName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User First Last</label>
            <span >{{FormatValue('UserFirstLast', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User Email</label>
            <span >{{FormatValue('UserEmail', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User Supervisor</label>
            <span >{{FormatValue('UserSupervisor', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User Supervisor Email</label>
            <span >{{FormatValue('UserSupervisorEmail', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <span >{{FormatValue('RecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Earliest At</label>
            <span >{{FormatValue('EarliestAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Latest At</label>
            <span >{{FormatValue('LatestAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Total Count</label>
            <span >{{FormatValue('TotalCount', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User Name</label>
            <span >{{FormatValue('UserName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User First Last</label>
            <span >{{FormatValue('UserFirstLast', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User Email</label>
            <span >{{FormatValue('UserEmail', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User Supervisor</label>
            <span >{{FormatValue('UserSupervisor', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User Supervisor Email</label>
            <span >{{FormatValue('UserSupervisorEmail', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class UserRecordLogDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: UserRecordLogEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadUserRecordLogDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
