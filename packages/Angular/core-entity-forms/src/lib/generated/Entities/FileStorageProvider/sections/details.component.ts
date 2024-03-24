import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'File Storage Providers.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-filestorageprovider-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Server Driver Key</label>
            <kendo-textbox [(ngModel)]="record.ServerDriverKey"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Client Driver Key</label>
            <kendo-textbox [(ngModel)]="record.ClientDriverKey"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Priority</label>
            <kendo-numerictextbox [(value)]="record.Priority" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
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
            <label class="fieldLabel">Server Driver Key</label>
            <span >{{FormatValue('ServerDriverKey', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Client Driver Key</label>
            <span >{{FormatValue('ClientDriverKey', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Priority</label>
            <span >{{FormatValue('Priority', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
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
export class FileStorageProviderDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: FileStorageProviderEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadFileStorageProviderDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
