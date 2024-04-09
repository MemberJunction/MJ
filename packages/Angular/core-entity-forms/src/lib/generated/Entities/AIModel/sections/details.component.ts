import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { AIModelEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'AI Models.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-aimodel-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Vendor</label>
            <kendo-textbox [(ngModel)]="record.Vendor"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">AI Model Type ID</label>
            <kendo-numerictextbox [(value)]="record.AIModelTypeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Driver Class</label>
            <kendo-textbox [(ngModel)]="record.DriverClass"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Driver Import Path</label>
            <kendo-textarea [(ngModel)]="record.DriverImportPath" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">APIName</label>
            <kendo-textbox [(ngModel)]="record.APIName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Power Rank</label>
            <kendo-numerictextbox [(value)]="record.PowerRank!" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">AIModel Type</label>
            <span >{{FormatValue('AIModelType', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Vendor</label>
            <span >{{FormatValue('Vendor', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">AI Model Type ID</label>
            <span mjFieldLink [record]="record" fieldName="AIModelTypeID" >{{FormatValue('AIModelTypeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Driver Class</label>
            <span >{{FormatValue('DriverClass', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Driver Import Path</label>
            <span >{{FormatValue('DriverImportPath', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">APIName</label>
            <span >{{FormatValue('APIName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Power Rank</label>
            <span >{{FormatValue('PowerRank', 0)}}</span>
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
            <label class="fieldLabel">AIModel Type</label>
            <span >{{FormatValue('AIModelType', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class AIModelDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AIModelEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAIModelDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
