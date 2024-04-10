import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { DataContextItemEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Data Context Items.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-datacontextitem-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Data Context ID</label>
            <kendo-numerictextbox [(value)]="record.DataContextID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <kendo-dropdownlist [data]="['view', 'sql', 'query', 'single_record', 'full_entity']" [(ngModel)]="record.Type" ></kendo-dropdownlist>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">View ID</label>
            <kendo-numerictextbox [(value)]="record.ViewID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Query ID</label>
            <kendo-numerictextbox [(value)]="record.QueryID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record ID</label>
            <kendo-textarea [(ngModel)]="record.RecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">SQL</label>
            <kendo-textbox [(ngModel)]="record.SQL"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Data JSON</label>
            <kendo-textbox [(ngModel)]="record.DataJSON"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Last Refreshed At</label>
            <kendo-datepicker [(value)]="record.LastRefreshedAt!" ></kendo-datepicker>   
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
            <label class="fieldLabel">Data Context</label>
            <span >{{FormatValue('DataContext', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">View</label>
            <span >{{FormatValue('View', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Query</label>
            <span >{{FormatValue('Query', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Data Context ID</label>
            <span mjFieldLink [record]="record" fieldName="DataContextID" >{{FormatValue('DataContextID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Type</label>
            <span >{{FormatValue('Type', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">View ID</label>
            <span mjFieldLink [record]="record" fieldName="ViewID" >{{FormatValue('ViewID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Query ID</label>
            <span mjFieldLink [record]="record" fieldName="QueryID" >{{FormatValue('QueryID', 0)}}</span>
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
            <label class="fieldLabel">SQL</label>
            <span >{{FormatValue('SQL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Data JSON</label>
            <span >{{FormatValue('DataJSON', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Last Refreshed At</label>
            <span >{{FormatValue('LastRefreshedAt', 0)}}</span>
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
            <label class="fieldLabel">Data Context</label>
            <span >{{FormatValue('DataContext', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">View</label>
            <span >{{FormatValue('View', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Query</label>
            <span >{{FormatValue('Query', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class DataContextItemDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: DataContextItemEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadDataContextItemDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      