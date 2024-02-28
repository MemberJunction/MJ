import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EntityDocumentRunEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity Document Runs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entitydocumentrun-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity Document ID</label>
            <kendo-numerictextbox [(value)]="record.EntityDocumentID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Started At</label>
            <kendo-datepicker [(value)]="record.StartedAt" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Ended At</label>
            <kendo-datepicker [(value)]="record.EndedAt" ></kendo-datepicker>   
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
            <label class="fieldLabel">Entity Document</label>
            <span >{{FormatValue('EntityDocument', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity Document ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityDocumentID" >{{FormatValue('EntityDocumentID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Started At</label>
            <span >{{FormatValue('StartedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Ended At</label>
            <span >{{FormatValue('EndedAt', 0)}}</span>
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
            <label class="fieldLabel">Entity Document</label>
            <span >{{FormatValue('EntityDocument', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityDocumentRunDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityDocumentRunEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityDocumentRunDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
