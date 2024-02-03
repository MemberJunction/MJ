import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { QueryFieldEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Query Fields.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-queryfield-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Query ID</label>
            <kendo-numerictextbox [(value)]="record.QueryID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textarea [(ngModel)]="record.Name" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <kendo-numerictextbox [(value)]="record.Sequence" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Source Entity ID</label>
            <kendo-numerictextbox [(value)]="record.SourceEntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Source Field Name</label>
            <kendo-textarea [(ngModel)]="record.SourceFieldName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Computed</label>
            <input type="checkbox" [(ngModel)]="record.IsComputed" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Computation Description</label>
            <kendo-textbox [(ngModel)]="record.ComputationDescription"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Summary</label>
            <input type="checkbox" [(ngModel)]="record.IsSummary" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Summary Description</label>
            <kendo-textbox [(ngModel)]="record.SummaryDescription"  />   
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
            <label class="fieldLabel">Query</label>
            <span >{{FormatValue('Query', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Source Entity</label>
            <span >{{FormatValue('SourceEntity', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Query ID</label>
            <span mjFieldLink [record]="record" fieldName="QueryID" >{{FormatValue('QueryID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Source Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="SourceEntityID" >{{FormatValue('SourceEntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Source Field Name</label>
            <span >{{FormatValue('SourceFieldName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Computed</label>
            <span >{{FormatValue('IsComputed', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Computation Description</label>
            <span >{{FormatValue('ComputationDescription', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Summary</label>
            <span >{{FormatValue('IsSummary', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Summary Description</label>
            <span >{{FormatValue('SummaryDescription', 0)}}</span>
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
            <label class="fieldLabel">Query</label>
            <span >{{FormatValue('Query', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Source Entity</label>
            <span >{{FormatValue('SourceEntity', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class QueryFieldDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: QueryFieldEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadQueryFieldDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
