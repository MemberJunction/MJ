import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entities.top-area') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entity-form-top-area',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textarea [(ngModel)]="record.Name" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Base Table</label>
            <span >{{FormatValue('BaseTable', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Base View</label>
            <kendo-textarea [(ngModel)]="record.BaseView" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Schema Name</label>
            <span >{{FormatValue('SchemaName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Track Record Changes</label>
            <input type="checkbox" [(ngModel)]="record.TrackRecordChanges" kendoCheckBox />   
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
            <label class="fieldLabel">Base Table</label>
            <span >{{FormatValue('BaseTable', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Base View</label>
            <span >{{FormatValue('BaseView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Schema Name</label>
            <span >{{FormatValue('SchemaName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Track Record Changes</label>
            <span >{{FormatValue('TrackRecordChanges', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityTopComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityTopComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
