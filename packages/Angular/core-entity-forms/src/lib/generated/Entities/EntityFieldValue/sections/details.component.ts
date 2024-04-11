import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityFieldValueEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity Field Values.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entityfieldvalue-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Field Name</label>
            <kendo-textarea [(ngModel)]="record.EntityFieldName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <kendo-numerictextbox [(value)]="record.Sequence" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Value</label>
            <kendo-textarea [(ngModel)]="record.Value" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Code</label>
            <kendo-textbox [(ngModel)]="record.Code"  />   
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
            <label class="fieldLabel">Entity Field</label>
            <span >{{FormatValue('EntityField', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Field Name</label>
            <span mjFieldLink [record]="record" fieldName="EntityFieldName" >{{FormatValue('EntityFieldName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Value</label>
            <span >{{FormatValue('Value', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Code</label>
            <span >{{FormatValue('Code', 0)}}</span>
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
            <label class="fieldLabel">Entity Field</label>
            <span >{{FormatValue('EntityField', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityFieldValueDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityFieldValueEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityFieldValueDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      