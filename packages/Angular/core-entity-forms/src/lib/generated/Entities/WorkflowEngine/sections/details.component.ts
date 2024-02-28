import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { WorkflowEngineEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Workflow Engines.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-workflowengine-form-details',
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
            <label class="fieldLabel">Driver Path</label>
            <kendo-textarea [(ngModel)]="record.DriverPath" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Driver Class</label>
            <kendo-textbox [(ngModel)]="record.DriverClass"  />   
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
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Driver Path</label>
            <span >{{FormatValue('DriverPath', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Driver Class</label>
            <span >{{FormatValue('DriverClass', 0)}}</span>
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
export class WorkflowEngineDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: WorkflowEngineEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadWorkflowEngineDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
