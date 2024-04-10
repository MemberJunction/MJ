import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CompanyIntegrationRunDetailEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Company Integration Run Details.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-companyintegrationrundetail-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">CompanyIntegrationRun ID</label>
            <kendo-numerictextbox [(value)]="record.CompanyIntegrationRunID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <kendo-textarea [(ngModel)]="record.RecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Action</label>
            <kendo-textbox [(ngModel)]="record.Action"  />   
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
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Run Started At</label>
            <span >{{FormatValue('RunStartedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Run Ended At</label>
            <span >{{FormatValue('RunEndedAt', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">CompanyIntegrationRun ID</label>
            <span mjFieldLink [record]="record" fieldName="CompanyIntegrationRunID" >{{FormatValue('CompanyIntegrationRunID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <span >{{FormatValue('RecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Action</label>
            <span >{{FormatValue('Action', 0)}}</span>
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
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Run Started At</label>
            <span >{{FormatValue('RunStartedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Run Ended At</label>
            <span >{{FormatValue('RunEndedAt', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class CompanyIntegrationRunDetailDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CompanyIntegrationRunDetailEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCompanyIntegrationRunDetailDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      