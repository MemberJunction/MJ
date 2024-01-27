import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EmployeeCompanyIntegrationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Employee Company Integrations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-employeecompanyintegration-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <kendo-numerictextbox [(value)]="record.EmployeeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Record</label>
            <kendo-textbox [(ngModel)]="record.ExternalSystemRecordID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
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
            <label class="fieldLabel">Employee ID</label>
            <span mjFieldLink [record]="record" fieldName="EmployeeID" >{{FormatValue('EmployeeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationID" >{{FormatValue('CompanyIntegrationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Record</label>
            <span >{{FormatValue('ExternalSystemRecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
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
export class EmployeeCompanyIntegrationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EmployeeCompanyIntegrationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEmployeeCompanyIntegrationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
