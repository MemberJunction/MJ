import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { SkillEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Skills.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-skill-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Name</label>
            <kendo-textbox [(ngModel)]="record.Name"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Parent</label>
            <kendo-numerictextbox [(value)]="record.ParentID" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Parent</label>
            <span mjFieldLink [record]="record" fieldName="ParentID" >{{FormatValue('ParentID', 0)}}</span>
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
            <label class="fieldLabel">Parent</label>
            <span >{{FormatValue('Parent', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class SkillDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: SkillEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadSkillDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
