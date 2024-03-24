import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EmployeeRoleEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Employee Roles.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-employeerole-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <kendo-numerictextbox [(value)]="record.EmployeeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Role ID</label>
            <kendo-numerictextbox [(value)]="record.RoleID" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Role</label>
            <span >{{FormatValue('Role', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <span mjFieldLink [record]="record" fieldName="EmployeeID" >{{FormatValue('EmployeeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Role ID</label>
            <span mjFieldLink [record]="record" fieldName="RoleID" >{{FormatValue('RoleID', 0)}}</span>
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
            <label class="fieldLabel">Role</label>
            <span >{{FormatValue('Role', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EmployeeRoleDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EmployeeRoleEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEmployeeRoleDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
