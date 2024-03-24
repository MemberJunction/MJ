import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { AIModelActionEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'AI Model Actions.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-aimodelaction-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">AI Model ID</label>
            <kendo-numerictextbox [(value)]="record.AIModelID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">AI Action ID</label>
            <kendo-numerictextbox [(value)]="record.AIActionID" ></kendo-numerictextbox>   
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
        <div class="record-form-row">
            <label class="fieldLabel">AIModel</label>
            <span >{{FormatValue('AIModel', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">AIAction</label>
            <span >{{FormatValue('AIAction', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">AI Model ID</label>
            <span mjFieldLink [record]="record" fieldName="AIModelID" >{{FormatValue('AIModelID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">AI Action ID</label>
            <span mjFieldLink [record]="record" fieldName="AIActionID" >{{FormatValue('AIActionID', 0)}}</span>
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
        <div class="record-form-row">
            <label class="fieldLabel">AIModel</label>
            <span >{{FormatValue('AIModel', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">AIAction</label>
            <span >{{FormatValue('AIAction', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class AIModelActionDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AIModelActionEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAIModelActionDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
