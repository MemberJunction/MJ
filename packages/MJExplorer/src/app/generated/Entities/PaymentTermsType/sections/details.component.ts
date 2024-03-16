import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { PaymentTermsTypeEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Payment Terms Types.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-paymenttermstype-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <kendo-textbox [(ngModel)]="record.DisplayName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Code</label>
            <kendo-textbox [(ngModel)]="record.Code"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Due Date Calculation</label>
            <kendo-textbox [(ngModel)]="record.DueDateCalculation"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textarea [(ngModel)]="record.Description" ></kendo-textarea>   
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
            <label class="fieldLabel">Company Integration ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Record ID</label>
            <kendo-textbox [(ngModel)]="record.ExternalSystemRecordID"  />   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <span >{{FormatValue('DisplayName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Code</label>
            <span >{{FormatValue('Code', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Due Date Calculation</label>
            <span >{{FormatValue('DueDateCalculation', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
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
            <label class="fieldLabel">Company Integration ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationID" >{{FormatValue('CompanyIntegrationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Record ID</label>
            <span >{{FormatValue('ExternalSystemRecordID', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class PaymentTermsTypeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: PaymentTermsTypeEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadPaymentTermsTypeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
