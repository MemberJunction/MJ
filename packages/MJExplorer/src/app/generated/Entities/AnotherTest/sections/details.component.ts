import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { AnotherTestEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Another Tests.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-anothertest-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Test Value</label>
            <kendo-datepicker [(value)]="record.TestValue!" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Test Number</label>
            <kendo-numerictextbox [(value)]="record.TestNumber!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Test Required Money</label>
            <kendo-numerictextbox [(value)]="record.TestRequiredMoney" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <kendo-textbox [(ngModel)]="record.Comments"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>   
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
            <label class="fieldLabel">Test Value</label>
            <span >{{FormatValue('TestValue', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Test Number</label>
            <span >{{FormatValue('TestNumber', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Test Required Money</label>
            <span >{{FormatValue('TestRequiredMoney', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Comments</label>
            <span >{{FormatValue('Comments', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Updated At</label>
            <span >{{FormatValue('UpdatedAt', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class AnotherTestDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AnotherTestEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAnotherTestDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
