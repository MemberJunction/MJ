import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { FileEntityRecordLinkEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'File Entity Record Links.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-fileentityrecordlink-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">File ID</label>
            <kendo-numerictextbox [(value)]="record.FileID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record ID</label>
            <kendo-textarea [(ngModel)]="record.RecordID" ></kendo-textarea>   
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
            <label class="fieldLabel">File</label>
            <span >{{FormatValue('File', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">File ID</label>
            <span mjFieldLink [record]="record" fieldName="FileID" >{{FormatValue('FileID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record ID</label>
            <span >{{FormatValue('RecordID', 0)}}</span>
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
            <label class="fieldLabel">File</label>
            <span >{{FormatValue('File', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class FileEntityRecordLinkDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: FileEntityRecordLinkEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadFileEntityRecordLinkDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      