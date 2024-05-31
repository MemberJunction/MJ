import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { AIModelActionEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'AI Model Actions.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-aimodelaction-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
    [record]="record"
    FieldName="AIModelID"
    Type="numerictextbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="AIActionID"
    Type="numerictextbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="IsActive"
    Type="checkbox"
    [EditMode]="EditMode"
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
    FieldName="AIModel"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="AIAction"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>

    </div>
</div>
    `
})
export class AIModelActionDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AIModelActionEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAIModelActionDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      