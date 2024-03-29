import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { VectorDatabaseEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Vector Databases.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-vectordatabase-form-details',
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
            <label class="fieldLabel">Default URL</label>
            <kendo-textarea [(ngModel)]="record.DefaultURL" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Class Key</label>
            <kendo-textbox [(ngModel)]="record.ClassKey"  />   
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
            <label class="fieldLabel">Default URL</label>
            <span >{{FormatValue('DefaultURL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Class Key</label>
            <span >{{FormatValue('ClassKey', 0)}}</span>
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
export class VectorDatabaseDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: VectorDatabaseEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadVectorDatabaseDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
