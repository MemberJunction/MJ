import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EntityPermissionEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity Permissions.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entitypermission-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Role Name</label>
            <kendo-textbox [(ngModel)]="record.RoleName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Can Create</label>
            <input type="checkbox" [(ngModel)]="record.CanCreate" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Can Read</label>
            <input type="checkbox" [(ngModel)]="record.CanRead" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Can Update</label>
            <input type="checkbox" [(ngModel)]="record.CanUpdate" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Can Delete</label>
            <input type="checkbox" [(ngModel)]="record.CanDelete" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Read RLSFilter ID</label>
            <kendo-numerictextbox [(value)]="record.ReadRLSFilterID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Create RLSFilter ID</label>
            <kendo-numerictextbox [(value)]="record.CreateRLSFilterID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Update RLSFilter ID</label>
            <kendo-numerictextbox [(value)]="record.UpdateRLSFilterID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Delete RLSFilter ID</label>
            <kendo-numerictextbox [(value)]="record.DeleteRLSFilterID!" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Role SQLName</label>
            <span >{{FormatValue('RoleSQLName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Create RLSFilter</label>
            <span >{{FormatValue('CreateRLSFilter', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Read RLSFilter</label>
            <span >{{FormatValue('ReadRLSFilter', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Update RLSFilter</label>
            <span >{{FormatValue('UpdateRLSFilter', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Delete RLSFilter</label>
            <span >{{FormatValue('DeleteRLSFilter', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Role Name</label>
            <span mjFieldLink [record]="record" fieldName="RoleName" >{{FormatValue('RoleName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Can Create</label>
            <span >{{FormatValue('CanCreate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Can Read</label>
            <span >{{FormatValue('CanRead', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Can Update</label>
            <span >{{FormatValue('CanUpdate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Can Delete</label>
            <span >{{FormatValue('CanDelete', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Read RLSFilter ID</label>
            <span mjFieldLink [record]="record" fieldName="ReadRLSFilterID" >{{FormatValue('ReadRLSFilterID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Create RLSFilter ID</label>
            <span mjFieldLink [record]="record" fieldName="CreateRLSFilterID" >{{FormatValue('CreateRLSFilterID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Update RLSFilter ID</label>
            <span mjFieldLink [record]="record" fieldName="UpdateRLSFilterID" >{{FormatValue('UpdateRLSFilterID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Delete RLSFilter ID</label>
            <span mjFieldLink [record]="record" fieldName="DeleteRLSFilterID" >{{FormatValue('DeleteRLSFilterID', 0)}}</span>
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
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Role SQLName</label>
            <span >{{FormatValue('RoleSQLName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Create RLSFilter</label>
            <span >{{FormatValue('CreateRLSFilter', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Read RLSFilter</label>
            <span >{{FormatValue('ReadRLSFilter', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Update RLSFilter</label>
            <span >{{FormatValue('UpdateRLSFilter', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Delete RLSFilter</label>
            <span >{{FormatValue('DeleteRLSFilter', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityPermissionDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityPermissionEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityPermissionDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
