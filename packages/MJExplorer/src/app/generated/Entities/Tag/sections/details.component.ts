import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { TagEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Tags.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-tag-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textarea [(ngModel)]="record.Name" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <kendo-textarea [(ngModel)]="record.DisplayName" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <kendo-textbox [(ngModel)]="record.Description"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Parent ID</label>
            <kendo-numerictextbox [(value)]="record.ParentID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Parent</label>
            <span >{{FormatValue('Parent', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <span >{{FormatValue('Name', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Display Name</label>
            <span >{{FormatValue('DisplayName', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Description</label>
            <span >{{FormatValue('Description', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Parent ID</label>
            <span mjFieldLink [record]="record" fieldName="ParentID" >{{FormatValue('ParentID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Parent</label>
            <span >{{FormatValue('Parent', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class TagDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: TagEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadTagDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
