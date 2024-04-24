import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { EntityEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Entities.api') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-entity-form-api',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field
            [record]="record"
            FieldName="IncludeInAPI"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="AllowAllRowsAPI"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="AllowUpdateAPI"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="AllowCreateAPI"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="AllowDeleteAPI"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="CustomResolverAPI"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field
            [record]="record"
            FieldName="AllowUserSearchAPI"
            Type="checkbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class EntityAPIComponent extends BaseFormSectionComponent {
    @Input() override record!: EntityEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadEntityAPIComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      