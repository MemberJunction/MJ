import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { UserViewRunDetailEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'User View Run Details.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-userviewrundetail-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User View Run ID</label>
            <kendo-numerictextbox [(value)]="record.UserViewRunID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <kendo-textarea [(ngModel)]="record.RecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User View</label>
            <span >{{FormatValue('UserViewID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('EntityID', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User View Run ID</label>
            <span mjFieldLink [record]="record" fieldName="UserViewRunID" >{{FormatValue('UserViewRunID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record</label>
            <span >{{FormatValue('RecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User View</label>
            <span >{{FormatValue('UserViewID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('EntityID', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class UserViewRunDetailDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: UserViewRunDetailEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadUserViewRunDetailDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      