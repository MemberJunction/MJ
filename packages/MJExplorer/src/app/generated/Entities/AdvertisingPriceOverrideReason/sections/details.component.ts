import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { AdvertisingPriceOverrideReasonEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Advertising Price Override Reasons.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-advertisingpriceoverridereason-form-details',
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

    </div>
</div>
    `
})
export class AdvertisingPriceOverrideReasonDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: AdvertisingPriceOverrideReasonEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadAdvertisingPriceOverrideReasonDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      