import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EmployeeSkillEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Employee Skills.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-employeeskill-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
    [record]="record"
    FieldName="EmployeeID"
    Type="numerictextbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="SkillID"
    Type="numerictextbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="CreatedAt"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="UpdatedAt"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="Skill"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>

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
      