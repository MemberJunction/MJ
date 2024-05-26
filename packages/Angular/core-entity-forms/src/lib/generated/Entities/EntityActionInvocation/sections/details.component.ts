import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityActionInvocationEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity Action Invocations.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entityactioninvocation-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field
            [record]="record"
            FieldName="EntityActionID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="InvocationTypeID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="Status"
            Type="dropdownlist"
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
            FieldName="InvocationType"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class EntityActionInvocationDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityActionInvocationEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityActionInvocationDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      