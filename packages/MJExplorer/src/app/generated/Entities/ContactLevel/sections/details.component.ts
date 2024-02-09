import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { ContactLevelEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Contact Levels.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-contactlevel-form-details',
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
            <label class="fieldLabel">Rank</label>
            <kendo-numerictextbox [(value)]="record.Rank" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Keywords</label>
            <kendo-textbox [(ngModel)]="record.Keywords"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Exclude Keywords</label>
            <kendo-textbox [(ngModel)]="record.ExcludeKeywords"  />   
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
            <label class="fieldLabel">Rank</label>
            <span >{{FormatValue('Rank', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Keywords</label>
            <span >{{FormatValue('Keywords', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Exclude Keywords</label>
            <span >{{FormatValue('ExcludeKeywords', 0)}}</span>
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
export class ContactLevelDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ContactLevelEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadContactLevelDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
