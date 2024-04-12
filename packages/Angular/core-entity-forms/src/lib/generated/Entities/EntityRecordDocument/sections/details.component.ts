import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityRecordDocumentEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity Record Documents.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entityrecorddocument-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record ID</label>
            <kendo-textarea [(ngModel)]="record.RecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Document Text</label>
            <kendo-textbox [(ngModel)]="record.DocumentText"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Vector Index ID</label>
            <kendo-numerictextbox [(value)]="record.VectorIndexID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Vector ID</label>
            <kendo-textbox [(ngModel)]="record.VectorID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Vector JSON</label>
            <kendo-textbox [(ngModel)]="record.VectorJSON"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Record Updated At</label>
            <kendo-datepicker [(value)]="record.EntityRecordUpdatedAt" ></kendo-datepicker>   
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
            <label class="fieldLabel">Entity Document ID</label>
            <kendo-numerictextbox [(value)]="record.EntityDocumentID" ></kendo-numerictextbox>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record ID</label>
            <span >{{FormatValue('RecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Document Text</label>
            <span >{{FormatValue('DocumentText', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Vector Index ID</label>
            <span >{{FormatValue('VectorIndexID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Vector ID</label>
            <span >{{FormatValue('VectorID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Vector JSON</label>
            <span >{{FormatValue('VectorJSON', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Record Updated At</label>
            <span >{{FormatValue('EntityRecordUpdatedAt', 0)}}</span>
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
            <label class="fieldLabel">Entity Document ID</label>
            <span >{{FormatValue('EntityDocumentID', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityRecordDocumentDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityRecordDocumentEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityRecordDocumentDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      