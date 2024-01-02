import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { CompanyEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Companies.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-company-form-details',
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
            <label class="fieldLabel">Website</label>
            <kendo-textbox [(ngModel)]="record.Website"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Logo URL</label>
            <kendo-textarea [(ngModel)]="record.LogoURL" ></kendo-textarea>   
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
            <label class="fieldLabel">Domain</label>
            <kendo-textarea [(ngModel)]="record.Domain" ></kendo-textarea>   
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
            <label class="fieldLabel">Website</label>
            <span mjWebLink [field]="record.GetFieldByName('Website')" >{{FormatValue('Website', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Logo URL</label>
            <span mjWebLink [field]="record.GetFieldByName('LogoURL')" >{{FormatValue('LogoURL', 0)}}</span>
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
            <label class="fieldLabel">Domain</label>
            <span >{{FormatValue('Domain', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class CompanyDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: CompanyEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadCompanyDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
