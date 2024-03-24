import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ErrorLogEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Error Logs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-errorlog-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">CompanyIntegrationRun ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationRunID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">CompanyIntegrationRunDetail ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationRunDetailID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Code</label>
            <kendo-textbox [(ngModel)]="record.Code"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Message</label>
            <kendo-textbox [(ngModel)]="record.Message"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created By</label>
            <kendo-textbox [(ngModel)]="record.CreatedBy"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <kendo-textbox [(ngModel)]="record.Status"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Category</label>
            <kendo-textbox [(ngModel)]="record.Category"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Details</label>
            <kendo-textbox [(ngModel)]="record.Details"  />   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">CompanyIntegrationRun ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationRunID" >{{FormatValue('CompanyIntegrationRunID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">CompanyIntegrationRunDetail ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationRunDetailID" >{{FormatValue('CompanyIntegrationRunDetailID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Code</label>
            <span >{{FormatValue('Code', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Message</label>
            <span >{{FormatValue('Message', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created By</label>
            <span >{{FormatValue('CreatedBy', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Details</label>
            <span >{{FormatValue('Details', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ErrorLogDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ErrorLogEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadErrorLogDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
