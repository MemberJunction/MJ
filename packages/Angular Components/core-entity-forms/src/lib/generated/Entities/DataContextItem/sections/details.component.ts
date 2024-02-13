import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
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
            <kendo-textbox [(ngModel)]="record.Type"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record ID</label>
            <kendo-numerictextbox [(value)]="record.RecordID" ></kendo-numerictextbox>   
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
            <kendo-datepicker [(value)]="record.LastRefreshedAt" ></kendo-datepicker>   
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
