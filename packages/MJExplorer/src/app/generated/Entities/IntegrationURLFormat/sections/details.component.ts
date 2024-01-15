import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { IntegrationURLFormatEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Integration URL Formats.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-integrationurlformat-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Integration Name</label>
            <kendo-textbox [(ngModel)]="record.IntegrationName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">URLFormat</label>
            <kendo-textarea [(ngModel)]="record.URLFormat" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Integration ID</label>
            <span >{{FormatValue('IntegrationID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Integration</label>
            <span >{{FormatValue('Integration', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Navigation Base URL</label>
            <span >{{FormatValue('NavigationBaseURL', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Full URLFormat</label>
            <span >{{FormatValue('FullURLFormat', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Integration Name</label>
            <span mjFieldLink [record]="record" fieldName="IntegrationName" >{{FormatValue('IntegrationName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">URLFormat</label>
            <span mjWebLink [field]="record.GetFieldByName('URLFormat')" >{{FormatValue('URLFormat', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Integration ID</label>
            <span >{{FormatValue('IntegrationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Integration</label>
            <span >{{FormatValue('Integration', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Navigation Base URL</label>
            <span >{{FormatValue('NavigationBaseURL', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Full URLFormat</label>
            <span >{{FormatValue('FullURLFormat', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class IntegrationURLFormatDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: IntegrationURLFormatEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadIntegrationURLFormatDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
