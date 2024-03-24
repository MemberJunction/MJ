import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CompanyIntegrationRunAPILogEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Company Integration Run API Logs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-companyintegrationrunapilog-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration Run ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationRunID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Executed At</label>
            <kendo-datepicker [(value)]="record.ExecutedAt" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Success</label>
            <input type="checkbox" [(ngModel)]="record.IsSuccess" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Request Method</label>
            <kendo-textbox [(ngModel)]="record.RequestMethod"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">URL</label>
            <kendo-textbox [(ngModel)]="record.URL"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Parameters</label>
            <kendo-textbox [(ngModel)]="record.Parameters"  />   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration Run ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationRunID" >{{FormatValue('CompanyIntegrationRunID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Executed At</label>
            <span >{{FormatValue('ExecutedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Success</label>
            <span >{{FormatValue('IsSuccess', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Request Method</label>
            <span >{{FormatValue('RequestMethod', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">URL</label>
            <span >{{FormatValue('URL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Parameters</label>
            <span >{{FormatValue('Parameters', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class CompanyIntegrationRunAPILogDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CompanyIntegrationRunAPILogEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCompanyIntegrationRunAPILogDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
