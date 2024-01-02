import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { UserViewRunEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'User View Runs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-userviewrun-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User View ID</label>
            <kendo-numerictextbox [(value)]="record.UserViewID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Run At</label>
            <kendo-datepicker [(value)]="record.RunAt" ></kendo-datepicker>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Run By User ID</label>
            <kendo-numerictextbox [(value)]="record.RunByUserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User View</label>
            <span >{{FormatValue('UserView', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Run By User</label>
            <span >{{FormatValue('RunByUser', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User View ID</label>
            <span mjFieldLink [record]="record" fieldName="UserViewID" >{{FormatValue('UserViewID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Run At</label>
            <span >{{FormatValue('RunAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Run By User ID</label>
            <span mjFieldLink [record]="record" fieldName="RunByUserID" >{{FormatValue('RunByUserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User View</label>
            <span >{{FormatValue('UserView', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Run By User</label>
            <span >{{FormatValue('RunByUser', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class UserViewRunDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: UserViewRunEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadUserViewRunDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
