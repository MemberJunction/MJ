import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { QueryPermissionEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Query Permissions.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-querypermission-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Query ID</label>
            <kendo-numerictextbox [(value)]="record.QueryID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Role Name</label>
            <kendo-textbox [(ngModel)]="record.RoleName"  />   
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
            <label class="fieldLabel">Query ID</label>
            <span mjFieldLink [record]="record" fieldName="QueryID" >{{FormatValue('QueryID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Role Name</label>
            <span mjFieldLink [record]="record" fieldName="RoleName" >{{FormatValue('RoleName', 0)}}</span>
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
export class QueryPermissionDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: QueryPermissionEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadQueryPermissionDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      