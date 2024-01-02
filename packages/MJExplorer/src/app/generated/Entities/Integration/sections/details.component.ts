import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { IntegrationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Integrations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-integration-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textarea [(ngModel)]="record.Description" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Navigation Base URL</label>
            <kendo-textarea [(ngModel)]="record.NavigationBaseURL" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Class Name</label>
            <kendo-textbox [(ngModel)]="record.ClassName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Import Path</label>
            <kendo-textbox [(ngModel)]="record.ImportPath"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Batch Max Request Count</label>
            <kendo-numerictextbox [(value)]="record.BatchMaxRequestCount" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Batch Request Wait Time</label>
            <kendo-numerictextbox [(value)]="record.BatchRequestWaitTime" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Navigation Base URL</label>
            <span mjWebLink [field]="record.GetFieldByName('NavigationBaseURL')" >{{FormatValue('NavigationBaseURL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Class Name</label>
            <span >{{FormatValue('ClassName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Import Path</label>
            <span >{{FormatValue('ImportPath', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Batch Max Request Count</label>
            <span >{{FormatValue('BatchMaxRequestCount', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Batch Request Wait Time</label>
            <span >{{FormatValue('BatchRequestWaitTime', 0)}}</span>
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
export class IntegrationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: IntegrationEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadIntegrationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
