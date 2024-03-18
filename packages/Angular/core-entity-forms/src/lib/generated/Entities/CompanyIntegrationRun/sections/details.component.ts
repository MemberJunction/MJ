import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { CompanyIntegrationRunEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Company Integration Runs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-companyintegrationrun-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">CompanyIntegration ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">RunByUser ID</label>
            <kendo-numerictextbox [(value)]="record.RunByUserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Started At</label>
            <kendo-datepicker [(value)]="record.StartedAt!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Ended At</label>
            <kendo-datepicker [(value)]="record.EndedAt!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Total Records</label>
            <kendo-numerictextbox [(value)]="record.TotalRecords" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <kendo-textbox [(ngModel)]="record.Comments"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Run By User</label>
            <span >{{FormatValue('RunByUser', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">CompanyIntegration ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationID" >{{FormatValue('CompanyIntegrationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">RunByUser ID</label>
            <span mjFieldLink [record]="record" fieldName="RunByUserID" >{{FormatValue('RunByUserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Started At</label>
            <span >{{FormatValue('StartedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Ended At</label>
            <span >{{FormatValue('EndedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Total Records</label>
            <span >{{FormatValue('TotalRecords', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <span >{{FormatValue('Comments', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Run By User</label>
            <span >{{FormatValue('RunByUser', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class CompanyIntegrationRunDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CompanyIntegrationRunEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCompanyIntegrationRunDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
