import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { DatasetItemEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Dataset Items.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-datasetitem-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Code</label>
            <kendo-textbox [(ngModel)]="record.Code"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Dataset Name</label>
            <kendo-textbox [(ngModel)]="record.DatasetName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <kendo-numerictextbox [(value)]="record.Sequence" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Where Clause</label>
            <kendo-textbox [(ngModel)]="record.WhereClause"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Date Field To Check</label>
            <kendo-textbox [(ngModel)]="record.DateFieldToCheck"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
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
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Code</label>
            <span >{{FormatValue('Code', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Dataset Name</label>
            <span mjFieldLink [record]="record" fieldName="DatasetName" >{{FormatValue('DatasetName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Where Clause</label>
            <span >{{FormatValue('WhereClause', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Date Field To Check</label>
            <span >{{FormatValue('DateFieldToCheck', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
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
    </div>
</div>
    `
})
export class DatasetItemDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: DatasetItemEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadDatasetItemDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      