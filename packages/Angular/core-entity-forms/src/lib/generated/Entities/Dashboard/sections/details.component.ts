import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { DashboardEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Dashboards.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-dashboard-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textarea [(ngModel)]="record.Name" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Category ID</label>
            <kendo-numerictextbox [(value)]="record.CategoryID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">UIConfig Details</label>
            <kendo-textbox [(ngModel)]="record.UIConfigDetails"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID!" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>   
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
            <label class="fieldLabel">Category ID</label>
            <span mjFieldLink [record]="record" fieldName="CategoryID" >{{FormatValue('CategoryID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">UIConfig Details</label>
            <span >{{FormatValue('UIConfigDetails', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Category</label>
            <span >{{FormatValue('Category', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class DashboardDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: DashboardEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadDashboardDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      