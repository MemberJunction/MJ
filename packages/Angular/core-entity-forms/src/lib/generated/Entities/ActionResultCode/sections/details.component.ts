import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ActionResultCodeEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Action Result Codes.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-actionresultcode-form-details',
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
            FieldName="ResultCode"
            Type="textarea"
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
export class ActionResultCodeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ActionResultCodeEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadActionResultCodeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      