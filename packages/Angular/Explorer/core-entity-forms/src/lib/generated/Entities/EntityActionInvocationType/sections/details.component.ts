import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityActionInvocationTypeEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entity Action Invocation Types.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entityactioninvocationtype-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Name"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Description"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="DisplaySequence"
            Type="numerictextbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="__mj_CreatedAt"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="__mj_UpdatedAt"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="ID_"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class EntityActionInvocationTypeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityActionInvocationTypeEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityActionInvocationTypeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      