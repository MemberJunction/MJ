import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { RoleEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Roles.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-role-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textarea [(ngModel)]="record.Description" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Azure</label>
            <kendo-textbox [(ngModel)]="record.AzureID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">SQLName</label>
            <kendo-textbox [(ngModel)]="record.SQLName"  />   
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
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Azure</label>
            <span >{{FormatValue('AzureID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">SQLName</label>
            <span >{{FormatValue('SQLName', 0)}}</span>
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
export class RoleDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: RoleEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadRoleDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
