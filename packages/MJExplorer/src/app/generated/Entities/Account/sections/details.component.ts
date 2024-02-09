import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { AccountEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Accounts.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-account-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textarea [(ngModel)]="record.Name" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Tax ID</label>
            <kendo-textbox [(ngModel)]="record.TaxID"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Acronym</label>
            <kendo-textbox [(ngModel)]="record.Acronym"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Operating Name</label>
            <kendo-textarea [(ngModel)]="record.OperatingName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <kendo-textarea [(ngModel)]="record.DisplayName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Address Line 1</label>
            <kendo-textbox [(ngModel)]="record.AddressLine1"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Address Line 2</label>
            <kendo-textbox [(ngModel)]="record.AddressLine2"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Address Line 3</label>
            <kendo-textbox [(ngModel)]="record.AddressLine3"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">City</label>
            <kendo-textbox [(ngModel)]="record.City"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">State Province</label>
            <kendo-textbox [(ngModel)]="record.StateProvince"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Postal Code</label>
            <kendo-textbox [(ngModel)]="record.PostalCode"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Country</label>
            <kendo-textbox [(ngModel)]="record.Country"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">ISOCountry Code</label>
            <kendo-textbox [(ngModel)]="record.ISOCountryCode"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Domain</label>
            <kendo-textarea [(ngModel)]="record.Domain" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Website</label>
            <kendo-textarea [(ngModel)]="record.Website" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Email Pattern</label>
            <kendo-textarea [(ngModel)]="record.EmailPattern" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Logo URL</label>
            <kendo-textarea [(ngModel)]="record.LogoURL" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Leadership Page URL</label>
            <kendo-textarea [(ngModel)]="record.LeadershipPageURL" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Phone Number</label>
            <kendo-textbox [(ngModel)]="record.PhoneNumber"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Linked In</label>
            <kendo-textarea [(ngModel)]="record.LinkedIn" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Facebook</label>
            <kendo-textarea [(ngModel)]="record.Facebook" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Logo</label>
            <kendo-textarea [(ngModel)]="record.Logo" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Industry ID</label>
            <kendo-numerictextbox [(value)]="record.IndustryID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Last Reviewed Date</label>
            <kendo-datepicker [(value)]="record.LastReviewedDate" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Activity Count</label>
            <kendo-numerictextbox [(value)]="record.ActivityCount" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Latest Activity Date</label>
            <kendo-datepicker [(value)]="record.LatestActivityDate" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Earliest Activity Date</label>
            <kendo-datepicker [(value)]="record.EarliestActivityDate" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record Source</label>
            <kendo-textbox [(ngModel)]="record.RecordSource"  />   
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
            <label class="fieldLabel">Last Enriched At</label>
            <kendo-datepicker [(value)]="record.LastEnrichedAt" ></kendo-datepicker>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">BCMID</label>
            <span >{{FormatValue('BCMID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Tax ID</label>
            <span >{{FormatValue('TaxID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Acronym</label>
            <span >{{FormatValue('Acronym', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Operating Name</label>
            <span >{{FormatValue('OperatingName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <span >{{FormatValue('DisplayName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Address Line 1</label>
            <span >{{FormatValue('AddressLine1', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Address Line 2</label>
            <span >{{FormatValue('AddressLine2', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Address Line 3</label>
            <span >{{FormatValue('AddressLine3', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">City</label>
            <span >{{FormatValue('City', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">State Province</label>
            <span >{{FormatValue('StateProvince', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Postal Code</label>
            <span >{{FormatValue('PostalCode', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Country</label>
            <span >{{FormatValue('Country', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">ISOCountry Code</label>
            <span >{{FormatValue('ISOCountryCode', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Domain</label>
            <span >{{FormatValue('Domain', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Website</label>
            <span >{{FormatValue('Website', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Email Pattern</label>
            <span >{{FormatValue('EmailPattern', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Logo URL</label>
            <span >{{FormatValue('LogoURL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Leadership Page URL</label>
            <span >{{FormatValue('LeadershipPageURL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Phone Number</label>
            <span >{{FormatValue('PhoneNumber', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Linked In</label>
            <span >{{FormatValue('LinkedIn', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Facebook</label>
            <span >{{FormatValue('Facebook', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Logo</label>
            <span >{{FormatValue('Logo', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Industry ID</label>
            <span mjFieldLink [record]="record" fieldName="IndustryID" >{{FormatValue('IndustryID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Last Reviewed Date</label>
            <span >{{FormatValue('LastReviewedDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Activity Count</label>
            <span >{{FormatValue('ActivityCount', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Latest Activity Date</label>
            <span >{{FormatValue('LatestActivityDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Earliest Activity Date</label>
            <span >{{FormatValue('EarliestActivityDate', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record Source</label>
            <span >{{FormatValue('RecordSource', 0)}}</span>
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
            <label class="fieldLabel">Last Enriched At</label>
            <span >{{FormatValue('LastEnrichedAt', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class AccountDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AccountEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAccountDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
