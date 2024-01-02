import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { UserApplicationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'User Applications.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-userapplication-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Application ID</label>
            <kendo-numerictextbox [(value)]="record.ApplicationID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <kendo-numerictextbox [(value)]="record.Sequence" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <input type="checkbox" [(ngModel)]="record.IsActive" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Application</label>
            <span >{{FormatValue('Application', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Application ID</label>
            <span mjFieldLink [record]="record" fieldName="ApplicationID" >{{FormatValue('ApplicationID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sequence</label>
            <span >{{FormatValue('Sequence', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Active</label>
            <span >{{FormatValue('IsActive', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Application</label>
            <span >{{FormatValue('Application', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class UserApplicationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: UserApplicationEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadUserApplicationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
