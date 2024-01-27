import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { EmployeeSkillEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Employee Skills.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-employeeskill-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <kendo-numerictextbox [(value)]="record.EmployeeID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Skill ID</label>
            <kendo-numerictextbox [(value)]="record.SkillID" ></kendo-numerictextbox>   
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
            <label class="fieldLabel">Skill</label>
            <span >{{FormatValue('Skill', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Employee ID</label>
            <span mjFieldLink [record]="record" fieldName="EmployeeID" >{{FormatValue('EmployeeID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Skill ID</label>
            <span mjFieldLink [record]="record" fieldName="SkillID" >{{FormatValue('SkillID', 0)}}</span>
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
            <label class="fieldLabel">Skill</label>
            <span >{{FormatValue('Skill', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class EmployeeSkillDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EmployeeSkillEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEmployeeSkillDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
