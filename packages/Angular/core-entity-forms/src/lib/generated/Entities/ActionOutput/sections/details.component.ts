import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ActionOutputEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Action Outputs.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-actionoutput-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field
            [record]="record"
            FieldName="ActionID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="Name"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="DefaultValue"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="Description"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="IsRequired"
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

    </div>
</div>
    `
})
export class ActionOutputDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ActionOutputEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadActionOutputDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      