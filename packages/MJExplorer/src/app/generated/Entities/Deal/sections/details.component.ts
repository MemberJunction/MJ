import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { DealEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Deals.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-deal-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Record ID</label>
            <kendo-textbox [(ngModel)]="record.ExternalSystemRecordID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Account ID</label>
            <kendo-numerictextbox [(value)]="record.AccountID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Contact ID</label>
            <kendo-numerictextbox [(value)]="record.ContactID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <kendo-textarea [(ngModel)]="record.Title" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Value</label>
            <kendo-numerictextbox [(value)]="record.Value!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Include In Forecast</label>
            <input type="checkbox" [(ngModel)]="record.IncludeInForecast" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Probability</label>
            <kendo-numerictextbox [(value)]="record.Probability!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Close Date</label>
            <kendo-datepicker [(value)]="record.CloseDate!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <kendo-numerictextbox [(value)]="record.EmployeeID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Pipeline</label>
            <kendo-textbox [(ngModel)]="record.Pipeline"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Lead Source</label>
            <kendo-textbox [(ngModel)]="record.LeadSource"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Lead Source Detail</label>
            <kendo-textbox [(ngModel)]="record.LeadSourceDetail"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Created At</label>
            <kendo-datepicker [(value)]="record.ExternalSystemCreatedAt!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Updated At</label>
            <kendo-datepicker [(value)]="record.ExternalSystemUpdatedAt!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Deal Type ID</label>
            <kendo-numerictextbox [(value)]="record.DealTypeID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Deal Stage ID</label>
            <kendo-numerictextbox [(value)]="record.DealStageID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Deal Forecast Category ID</label>
            <kendo-numerictextbox [(value)]="record.DealForecastCategoryID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">MRR</label>
            <kendo-numerictextbox [(value)]="record.MRR" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">One Time Fees</label>
            <kendo-numerictextbox [(value)]="record.OneTimeFees" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Contract Term Months</label>
            <kendo-numerictextbox [(value)]="record.ContractTermMonths" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Forecast Notes</label>
            <kendo-textbox [(ngModel)]="record.ForecastNotes"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Deleted</label>
            <input type="checkbox" [(ngModel)]="record.IsDeleted" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Account</label>
            <span >{{FormatValue('Account', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Deal Type</label>
            <span >{{FormatValue('DealType', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Deal Stage</label>
            <span >{{FormatValue('DealStage', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Deal Forecast Category</label>
            <span >{{FormatValue('DealForecastCategory', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Record ID</label>
            <span >{{FormatValue('ExternalSystemRecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationID" >{{FormatValue('CompanyIntegrationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Account ID</label>
            <span mjFieldLink [record]="record" fieldName="AccountID" >{{FormatValue('AccountID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Contact ID</label>
            <span mjFieldLink [record]="record" fieldName="ContactID" >{{FormatValue('ContactID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Title</label>
            <span >{{FormatValue('Title', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Value</label>
            <span >{{FormatValue('Value', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Include In Forecast</label>
            <span >{{FormatValue('IncludeInForecast', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Probability</label>
            <span >{{FormatValue('Probability', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Close Date</label>
            <span >{{FormatValue('CloseDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <span mjFieldLink [record]="record" fieldName="EmployeeID" >{{FormatValue('EmployeeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Pipeline</label>
            <span >{{FormatValue('Pipeline', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Lead Source</label>
            <span >{{FormatValue('LeadSource', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Lead Source Detail</label>
            <span >{{FormatValue('LeadSourceDetail', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Created At</label>
            <span >{{FormatValue('ExternalSystemCreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Updated At</label>
            <span >{{FormatValue('ExternalSystemUpdatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Deal Type ID</label>
            <span mjFieldLink [record]="record" fieldName="DealTypeID" >{{FormatValue('DealTypeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Deal Stage ID</label>
            <span mjFieldLink [record]="record" fieldName="DealStageID" >{{FormatValue('DealStageID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Deal Forecast Category ID</label>
            <span mjFieldLink [record]="record" fieldName="DealForecastCategoryID" >{{FormatValue('DealForecastCategoryID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">MRR</label>
            <span >{{FormatValue('MRR', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">One Time Fees</label>
            <span >{{FormatValue('OneTimeFees', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Contract Term Months</label>
            <span >{{FormatValue('ContractTermMonths', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Forecast Notes</label>
            <span >{{FormatValue('ForecastNotes', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Deleted</label>
            <span >{{FormatValue('IsDeleted', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Account</label>
            <span >{{FormatValue('Account', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Deal Type</label>
            <span >{{FormatValue('DealType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Deal Stage</label>
            <span >{{FormatValue('DealStage', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Deal Forecast Category</label>
            <span >{{FormatValue('DealForecastCategory', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class DealDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: DealEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadDealDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
