import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { CompanyIntegrationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Company Integrations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-companyintegration-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Company Name</label>
            <kendo-textbox [(ngModel)]="record.CompanyName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Integration Name</label>
            <kendo-textbox [(ngModel)]="record.IntegrationName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Access Token</label>
            <kendo-textarea [(ngModel)]="record.AccessToken" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Refresh Token</label>
            <kendo-textarea [(ngModel)]="record.RefreshToken" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Token Expiration Date</label>
            <kendo-datepicker [(value)]="record.TokenExpirationDate" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">APIKey</label>
            <kendo-textarea [(ngModel)]="record.APIKey" ></kendo-textarea>   
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
            <label class="fieldLabel">ExternalSystem</label>
            <kendo-textbox [(ngModel)]="record.ExternalSystemID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is External System Read Only</label>
            <input type="checkbox" [(ngModel)]="record.IsExternalSystemReadOnly" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Client</label>
            <kendo-textarea [(ngModel)]="record.ClientID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Client Secret</label>
            <kendo-textarea [(ngModel)]="record.ClientSecret" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Custom Attribute 1</label>
            <kendo-textarea [(ngModel)]="record.CustomAttribute1" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Company ID</label>
            <span >{{FormatValue('CompanyID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Integration ID</label>
            <span >{{FormatValue('IntegrationID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Company</label>
            <span >{{FormatValue('Company', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Integration</label>
            <span >{{FormatValue('Integration', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Driver Class Name</label>
            <span >{{FormatValue('DriverClassName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Driver Import Path</label>
            <span >{{FormatValue('DriverImportPath', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">LastRun</label>
            <span >{{FormatValue('LastRunID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Last Run Started At</label>
            <span >{{FormatValue('LastRunStartedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Last Run Ended At</label>
            <span >{{FormatValue('LastRunEndedAt', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Company Name</label>
            <span mjFieldLink [record]="record" fieldName="CompanyName" >{{FormatValue('CompanyName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Integration Name</label>
            <span mjFieldLink [record]="record" fieldName="IntegrationName" >{{FormatValue('IntegrationName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Access Token</label>
            <span >{{FormatValue('AccessToken', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Refresh Token</label>
            <span >{{FormatValue('RefreshToken', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Token Expiration Date</label>
            <span >{{FormatValue('TokenExpirationDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">APIKey</label>
            <span >{{FormatValue('APIKey', 0)}}</span>
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
            <label class="fieldLabel">ExternalSystem</label>
            <span >{{FormatValue('ExternalSystemID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is External System Read Only</label>
            <span >{{FormatValue('IsExternalSystemReadOnly', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Client</label>
            <span >{{FormatValue('ClientID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Client Secret</label>
            <span >{{FormatValue('ClientSecret', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Custom Attribute 1</label>
            <span >{{FormatValue('CustomAttribute1', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Company ID</label>
            <span >{{FormatValue('CompanyID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Integration ID</label>
            <span >{{FormatValue('IntegrationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Company</label>
            <span >{{FormatValue('Company', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Integration</label>
            <span >{{FormatValue('Integration', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Driver Class Name</label>
            <span >{{FormatValue('DriverClassName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Driver Import Path</label>
            <span >{{FormatValue('DriverImportPath', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">LastRun</label>
            <span >{{FormatValue('LastRunID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Last Run Started At</label>
            <span >{{FormatValue('LastRunStartedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Last Run Ended At</label>
            <span >{{FormatValue('LastRunEndedAt', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class CompanyIntegrationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CompanyIntegrationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCompanyIntegrationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
