import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { WorkspaceItemEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Workspace Items.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-workspaceitem-form-details',
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
            <label class="fieldLabel">Work Space ID</label>
            <kendo-numerictextbox [(value)]="record.WorkSpaceID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Resource Type ID</label>
            <kendo-numerictextbox [(value)]="record.ResourceTypeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Resource Record ID</label>
            <kendo-numerictextbox [(value)]="record.ResourceRecordID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <kendo-numerictextbox [(value)]="record.Sequence" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Configuration</label>
            <kendo-textbox [(ngModel)]="record.Configuration"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Work Space</label>
            <span >{{FormatValue('WorkSpace', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Resource Type</label>
            <span >{{FormatValue('ResourceType', 0)}}</span>   
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
            <label class="fieldLabel">Work Space ID</label>
            <span mjFieldLink [record]="record" fieldName="WorkSpaceID" >{{FormatValue('WorkSpaceID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Resource Type ID</label>
            <span mjFieldLink [record]="record" fieldName="ResourceTypeID" >{{FormatValue('ResourceTypeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Resource Record ID</label>
            <span >{{FormatValue('ResourceRecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Configuration</label>
            <span >{{FormatValue('Configuration', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Work Space</label>
            <span >{{FormatValue('WorkSpace', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Resource Type</label>
            <span >{{FormatValue('ResourceType', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class WorkspaceItemDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: WorkspaceItemEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadWorkspaceItemDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
