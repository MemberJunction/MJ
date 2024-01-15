import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { TaggedItemEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Tagged Items.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-taggeditem-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Tag ID</label>
            <kendo-numerictextbox [(value)]="record.TagID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <kendo-numerictextbox [(value)]="record.EntityID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Record ID</label>
            <kendo-textarea [(ngModel)]="record.RecordID" ></kendo-textarea>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Tag</label>
            <span >{{FormatValue('Tag', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Tag ID</label>
            <span mjFieldLink [record]="record" fieldName="TagID" >{{FormatValue('TagID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity ID</label>
            <span mjFieldLink [record]="record" fieldName="EntityID" >{{FormatValue('EntityID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Record ID</label>
            <span >{{FormatValue('RecordID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Tag</label>
            <span >{{FormatValue('Tag', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Entity</label>
            <span >{{FormatValue('Entity', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class TaggedItemDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: TaggedItemEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadTaggedItemDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
