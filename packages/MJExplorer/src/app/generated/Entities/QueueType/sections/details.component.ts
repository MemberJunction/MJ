import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { QueueTypeEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Queue Types.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-queuetype-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Driver Class</label>
            <kendo-textbox [(ngModel)]="record.DriverClass"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Driver Import Path</label>
            <kendo-textarea [(ngModel)]="record.DriverImportPath" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
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
            <label class="fieldLabel">Driver Class</label>
            <span >{{FormatValue('DriverClass', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Driver Import Path</label>
            <span >{{FormatValue('DriverImportPath', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class QueueTypeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: QueueTypeEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadQueueTypeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
