import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ActionAuthorizationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Action Authorizations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-actionauthorization-form-details',
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
            FieldName="AuthorizationID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="Comments"
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
        <mj-form-field
            [record]="record"
            FieldName="Authorization"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class ActionAuthorizationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ActionAuthorizationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadActionAuthorizationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      