import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { InvoiceEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Invoices.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-invoice-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Invoice Date</label>
            <kendo-datepicker [(value)]="record.InvoiceDate" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Account ID</label>
            <kendo-numerictextbox [(value)]="record.AccountID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Contact ID</label>
            <kendo-numerictextbox [(value)]="record.ContactID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sub Total</label>
            <kendo-numerictextbox [(value)]="record.SubTotal" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Tax</label>
            <kendo-numerictextbox [(value)]="record.Tax" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Total</label>
            <kendo-numerictextbox [(value)]="record.Total" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">External System Record ID</label>
            <kendo-textbox [(ngModel)]="record.ExternalSystemRecordID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Invoice Number</label>
            <kendo-textbox [(ngModel)]="record.InvoiceNumber"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Posting Date</label>
            <kendo-datepicker [(value)]="record.PostingDate!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Due Date</label>
            <kendo-datepicker [(value)]="record.DueDate!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status ID</label>
            <kendo-numerictextbox [(value)]="record.StatusID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Payment Terms ID</label>
            <kendo-numerictextbox [(value)]="record.PaymentTermsID!" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Account</label>
            <span >{{FormatValue('Account', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Payment Terms</label>
            <span >{{FormatValue('PaymentTerms', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Invoice Date</label>
            <span >{{FormatValue('InvoiceDate', 0)}}</span>
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
            <label class="fieldLabel">Sub Total</label>
            <span >{{FormatValue('SubTotal', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Tax</label>
            <span >{{FormatValue('Tax', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Total</label>
            <span >{{FormatValue('Total', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Company Integration ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationID" >{{FormatValue('CompanyIntegrationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">External System Record ID</label>
            <span >{{FormatValue('ExternalSystemRecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Invoice Number</label>
            <span >{{FormatValue('InvoiceNumber', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Posting Date</label>
            <span >{{FormatValue('PostingDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Due Date</label>
            <span >{{FormatValue('DueDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status ID</label>
            <span mjFieldLink [record]="record" fieldName="StatusID" >{{FormatValue('StatusID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Payment Terms ID</label>
            <span mjFieldLink [record]="record" fieldName="PaymentTermsID" >{{FormatValue('PaymentTermsID', 0)}}</span>
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
            <label class="fieldLabel">Account</label>
            <span >{{FormatValue('Account', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Status</label>
            <span >{{FormatValue('Status', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Payment Terms</label>
            <span >{{FormatValue('PaymentTerms', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class InvoiceDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: InvoiceEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadInvoiceDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
