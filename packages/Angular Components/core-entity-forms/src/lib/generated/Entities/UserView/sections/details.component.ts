import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { UserViewEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'User Views.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-userview-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">GUID</label>
            <span >{{FormatValue('GUID', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Category ID</label>
            <kendo-numerictextbox [(value)]="record.CategoryID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Shared</label>
            <input type="checkbox" [(ngModel)]="record.IsShared" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Is Default</label>
            <input type="checkbox" [(ngModel)]="record.IsDefault" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Grid State</label>
            <kendo-textbox [(ngModel)]="record.GridState"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Filter State</label>
            <kendo-textbox [(ngModel)]="record.FilterState"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Custom Filter State</label>
            <input type="checkbox" [(ngModel)]="record.CustomFilterState" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Smart Filter Enabled</label>
            <input type="checkbox" [(ngModel)]="record.SmartFilterEnabled" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Smart Filter Prompt</label>
            <kendo-textbox [(ngModel)]="record.SmartFilterPrompt"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Smart Filter Where Clause</label>
            <kendo-textbox [(ngModel)]="record.SmartFilterWhereClause"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Smart Filter Explanation</label>
            <kendo-textbox [(ngModel)]="record.SmartFilterExplanation"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Where Clause</label>
            <kendo-textbox [(ngModel)]="record.WhereClause"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Custom Where Clause</label>
            <input type="checkbox" [(ngModel)]="record.CustomWhereClause" kendoCheckBox />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Sort State</label>
            <kendo-textbox [(ngModel)]="record.SortState"  />   
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
            <label class="fieldLabel">User Name</label>
            <span >{{FormatValue('UserName', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User First Last</label>
            <span >{{FormatValue('UserFirstLast', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User Email</label>
            <span >{{FormatValue('UserEmail', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User Type</label>
            <span >{{FormatValue('UserType', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base View</label>
            <span >{{FormatValue('EntityBaseView', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">GUID</label>
            <span >{{FormatValue('GUID', 0)}}</span>
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
            <label class="fieldLabel">Is Shared</label>
            <span >{{FormatValue('IsShared', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Is Default</label>
            <span >{{FormatValue('IsDefault', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Grid State</label>
            <span >{{FormatValue('GridState', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Filter State</label>
            <span >{{FormatValue('FilterState', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Custom Filter State</label>
            <span >{{FormatValue('CustomFilterState', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Smart Filter Enabled</label>
            <span >{{FormatValue('SmartFilterEnabled', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Smart Filter Prompt</label>
            <span >{{FormatValue('SmartFilterPrompt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Smart Filter Where Clause</label>
            <span >{{FormatValue('SmartFilterWhereClause', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Smart Filter Explanation</label>
            <span >{{FormatValue('SmartFilterExplanation', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Where Clause</label>
            <span >{{FormatValue('WhereClause', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Custom Where Clause</label>
            <span >{{FormatValue('CustomWhereClause', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Sort State</label>
            <span >{{FormatValue('SortState', 0)}}</span>
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
            <label class="fieldLabel">User Name</label>
            <span >{{FormatValue('UserName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User First Last</label>
            <span >{{FormatValue('UserFirstLast', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User Email</label>
            <span >{{FormatValue('UserEmail', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User Type</label>
            <span >{{FormatValue('UserType', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity Base View</label>
            <span >{{FormatValue('EntityBaseView', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class UserViewDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: UserViewEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadUserViewDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
