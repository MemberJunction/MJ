import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { WorkflowEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Workflows.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-workflow-form-details',
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
            <label class="fieldLabel">Workflow Engine Name</label>
            <kendo-textbox [(ngModel)]="record.WorkflowEngineName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Company Name</label>
            <kendo-textbox [(ngModel)]="record.CompanyName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Record</label>
            <kendo-textbox [(ngModel)]="record.ExternalSystemRecordID"  />   
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
            <label class="fieldLabel">Workflow Engine Name</label>
            <span mjFieldLink [record]="record" fieldName="WorkflowEngineName" >{{FormatValue('WorkflowEngineName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Company Name</label>
            <span mjFieldLink [record]="record" fieldName="CompanyName" >{{FormatValue('CompanyName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Record</label>
            <span >{{FormatValue('ExternalSystemRecordID', 0)}}</span>
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
export class WorkflowDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: WorkflowEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadWorkflowDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
