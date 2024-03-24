import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ApplicationEntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Application Entities.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-applicationentity-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Application Name</label>
            <kendo-textbox [(ngModel)]="record.ApplicationName"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <kendo-numerictextbox [(value)]="record.Sequence" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Default For New User</label>
            <input type="checkbox" [(ngModel)]="record.DefaultForNewUser" kendoCheckBox />   
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
            <label class="fieldLabel">Application</label>
            <span >{{FormatValue('Application', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base Table</label>
            <span >{{FormatValue('EntityBaseTable', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Code Name</label>
            <span >{{FormatValue('EntityCodeName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Class Name</label>
            <span >{{FormatValue('EntityClassName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base Table Code Name</label>
            <span >{{FormatValue('EntityBaseTableCodeName', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Application Name</label>
            <span mjFieldLink [record]="record" fieldName="ApplicationName" >{{FormatValue('ApplicationName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Default For New User</label>
            <span >{{FormatValue('DefaultForNewUser', 0)}}</span>
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
            <label class="fieldLabel">Application</label>
            <span >{{FormatValue('Application', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base Table</label>
            <span >{{FormatValue('EntityBaseTable', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Code Name</label>
            <span >{{FormatValue('EntityCodeName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Class Name</label>
            <span >{{FormatValue('EntityClassName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base Table Code Name</label>
            <span >{{FormatValue('EntityBaseTableCodeName', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ApplicationEntityDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ApplicationEntityEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadApplicationEntityDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
