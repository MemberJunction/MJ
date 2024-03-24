import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { AuthorizationRoleEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Authorization Roles.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-authorizationrole-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Authorization Name</label>
            <kendo-textbox [(ngModel)]="record.AuthorizationName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Role Name</label>
            <kendo-textbox [(ngModel)]="record.RoleName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <kendo-textbox [(ngModel)]="record.Type"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Authorization Name</label>
            <span mjFieldLink [record]="record" fieldName="AuthorizationName" >{{FormatValue('AuthorizationName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Role Name</label>
            <span mjFieldLink [record]="record" fieldName="RoleName" >{{FormatValue('RoleName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <span >{{FormatValue('Type', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class AuthorizationRoleDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AuthorizationRoleEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAuthorizationRoleDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
