import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { UserEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Users.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-user-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">First Name</label>
            <kendo-textbox [(ngModel)]="record.FirstName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Last Name</label>
            <kendo-textbox [(ngModel)]="record.LastName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <kendo-textbox [(ngModel)]="record.Title"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Email</label>
            <kendo-textbox [(ngModel)]="record.Email"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <kendo-textbox [(ngModel)]="record.Type"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Linked Record Type</label>
            <kendo-textbox [(ngModel)]="record.LinkedRecordType"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Employee</label>
            <kendo-numerictextbox [(value)]="record.EmployeeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Linked Entity ID</label>
            <kendo-numerictextbox [(value)]="record.LinkedEntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Linked Entity Record ID</label>
            <kendo-numerictextbox [(value)]="record.LinkedEntityRecordID" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">First Last</label>
            <span >{{FormatValue('FirstLast', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Employee First Last</label>
            <span >{{FormatValue('EmployeeFirstLast', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Employee Email</label>
            <span >{{FormatValue('EmployeeEmail', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Employee Title</label>
            <span >{{FormatValue('EmployeeTitle', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Employee Supervisor</label>
            <span >{{FormatValue('EmployeeSupervisor', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Employee Supervisor Email</label>
            <span >{{FormatValue('EmployeeSupervisorEmail', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">First Name</label>
            <span >{{FormatValue('FirstName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Last Name</label>
            <span >{{FormatValue('LastName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <span >{{FormatValue('Title', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Email</label>
            <span mjEmailLink [field]="record.GetFieldByName('Email')" >{{FormatValue('Email', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <span >{{FormatValue('Type', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Linked Record Type</label>
            <span >{{FormatValue('LinkedRecordType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Employee</label>
            <span >{{FormatValue('EmployeeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Linked Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="LinkedEntityID" >{{FormatValue('LinkedEntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Linked Entity Record ID</label>
            <span >{{FormatValue('LinkedEntityRecordID', 0)}}</span>
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
            <label class="fieldLabel">First Last</label>
            <span >{{FormatValue('FirstLast', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Employee First Last</label>
            <span >{{FormatValue('EmployeeFirstLast', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Employee Email</label>
            <span >{{FormatValue('EmployeeEmail', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Employee Title</label>
            <span >{{FormatValue('EmployeeTitle', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Employee Supervisor</label>
            <span >{{FormatValue('EmployeeSupervisor', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Employee Supervisor Email</label>
            <span >{{FormatValue('EmployeeSupervisorEmail', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class UserDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: UserEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadUserDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
