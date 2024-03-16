import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { FileEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Files.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-file-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textarea [(ngModel)]="record.Name" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Provider ID</label>
            <kendo-numerictextbox [(value)]="record.ProviderID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Content Type</label>
            <kendo-textbox [(ngModel)]="record.ContentType"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Provider Key</label>
            <kendo-textarea [(ngModel)]="record.ProviderKey" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Category ID</label>
            <kendo-numerictextbox [(value)]="record.CategoryID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <kendo-textbox [(ngModel)]="record.Status"  />   
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
            <label class="fieldLabel">Provider</label>
            <span >{{FormatValue('Provider', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>   
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
            <label class="fieldLabel">Provider ID</label>
            <span mjFieldLink [record]="record" fieldName="ProviderID" >{{FormatValue('ProviderID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Content Type</label>
            <span >{{FormatValue('ContentType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Provider Key</label>
            <span >{{FormatValue('ProviderKey', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Category ID</label>
            <span mjFieldLink [record]="record" fieldName="CategoryID" >{{FormatValue('CategoryID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
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
            <label class="fieldLabel">Provider</label>
            <span >{{FormatValue('Provider', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class FileDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: FileEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadFileDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
