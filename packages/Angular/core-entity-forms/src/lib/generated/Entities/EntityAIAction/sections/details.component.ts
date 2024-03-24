import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityAIActionEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity AI Actions.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entityaiaction-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">AI Action ID</label>
            <kendo-numerictextbox [(value)]="record.AIActionID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">AI Model ID</label>
            <kendo-numerictextbox [(value)]="record.AIModelID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Prompt</label>
            <kendo-textbox [(ngModel)]="record.Prompt"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Trigger Event</label>
            <kendo-textbox [(ngModel)]="record.TriggerEvent"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User Message</label>
            <kendo-textbox [(ngModel)]="record.UserMessage"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Type</label>
            <kendo-textbox [(ngModel)]="record.OutputType"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Field</label>
            <kendo-textbox [(ngModel)]="record.OutputField"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Skip If Output Field Not Empty</label>
            <input type="checkbox" [(ngModel)]="record.SkipIfOutputFieldNotEmpty" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Entity ID</label>
            <kendo-numerictextbox [(value)]="record.OutputEntityID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <kendo-textbox [(ngModel)]="record.Comments"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">AIAction</label>
            <span >{{FormatValue('AIAction', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">AIModel</label>
            <span >{{FormatValue('AIModel', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Output Entity</label>
            <span >{{FormatValue('OutputEntity', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">AI Action ID</label>
            <span mjFieldLink [record]="record" fieldName="AIActionID" >{{FormatValue('AIActionID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">AI Model ID</label>
            <span mjFieldLink [record]="record" fieldName="AIModelID" >{{FormatValue('AIModelID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Prompt</label>
            <span >{{FormatValue('Prompt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Trigger Event</label>
            <span >{{FormatValue('TriggerEvent', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User Message</label>
            <span >{{FormatValue('UserMessage', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Type</label>
            <span >{{FormatValue('OutputType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Field</label>
            <span >{{FormatValue('OutputField', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Skip If Output Field Not Empty</label>
            <span >{{FormatValue('SkipIfOutputFieldNotEmpty', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="OutputEntityID" >{{FormatValue('OutputEntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <span >{{FormatValue('Comments', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">AIAction</label>
            <span >{{FormatValue('AIAction', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">AIModel</label>
            <span >{{FormatValue('AIModel', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Output Entity</label>
            <span >{{FormatValue('OutputEntity', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EntityAIActionDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityAIActionEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityAIActionDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
