import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EmployeeEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Employees.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-employee-form-details',
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
            <label class="fieldLabel">Phone</label>
            <kendo-textbox [(ngModel)]="record.Phone"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Active</label>
            <input type="checkbox" [(ngModel)]="record.Active" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Company ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Supervisor ID</label>
            <kendo-numerictextbox [(value)]="record.SupervisorID!" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Supervisor</label>
            <span >{{FormatValue('Supervisor', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Supervisor First Name</label>
            <span >{{FormatValue('SupervisorFirstName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Supervisor Last Name</label>
            <span >{{FormatValue('SupervisorLastName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Supervisor Email</label>
            <span >{{FormatValue('SupervisorEmail', 0)}}</span>   
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
            <label class="fieldLabel">Phone</label>
            <span >{{FormatValue('Phone', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Active</label>
            <span >{{FormatValue('Active', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Company ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyID" >{{FormatValue('CompanyID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Supervisor ID</label>
            <span mjFieldLink [record]="record" fieldName="SupervisorID" >{{FormatValue('SupervisorID', 0)}}</span>
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
            <label class="fieldLabel">Supervisor</label>
            <span >{{FormatValue('Supervisor', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Supervisor First Name</label>
            <span >{{FormatValue('SupervisorFirstName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Supervisor Last Name</label>
            <span >{{FormatValue('SupervisorLastName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Supervisor Email</label>
            <span >{{FormatValue('SupervisorEmail', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EmployeeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EmployeeEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEmployeeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
