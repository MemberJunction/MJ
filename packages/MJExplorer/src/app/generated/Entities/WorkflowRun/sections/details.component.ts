import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { WorkflowRunEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Workflow Runs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-workflowrun-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Workflow Name</label>
            <kendo-textbox [(ngModel)]="record.WorkflowName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Record</label>
            <kendo-textbox [(ngModel)]="record.ExternalSystemRecordID"  />   
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
            <label class="fieldLabel">Results</label>
            <kendo-textbox [(ngModel)]="record.Results"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Workflow</label>
            <span >{{FormatValue('Workflow', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Workflow Engine Name</label>
            <span >{{FormatValue('WorkflowEngineName', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Workflow Name</label>
            <span mjFieldLink [record]="record" fieldName="WorkflowName" >{{FormatValue('WorkflowName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Record</label>
            <span >{{FormatValue('ExternalSystemRecordID', 0)}}</span>
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
            <label class="fieldLabel">Results</label>
            <span >{{FormatValue('Results', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Workflow</label>
            <span >{{FormatValue('Workflow', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Workflow Engine Name</label>
            <span >{{FormatValue('WorkflowEngineName', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class WorkflowRunDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: WorkflowRunEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadWorkflowRunDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
