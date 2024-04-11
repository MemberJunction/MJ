import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { SchemaInfoEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Schema Info.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-schemainfo-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Schema Name</label>
            <kendo-textbox [(ngModel)]="record.SchemaName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity IDMin</label>
            <kendo-numerictextbox [(value)]="record.EntityIDMin" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity IDMax</label>
            <kendo-numerictextbox [(value)]="record.EntityIDMax" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <kendo-textbox [(ngModel)]="record.Comments"  />   
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
            <label class="fieldLabel">Schema Name</label>
            <span >{{FormatValue('SchemaName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity IDMin</label>
            <span >{{FormatValue('EntityIDMin', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity IDMax</label>
            <span >{{FormatValue('EntityIDMax', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <span >{{FormatValue('Comments', 0)}}</span>
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
export class SchemaInfoDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: SchemaInfoEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadSchemaInfoDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      