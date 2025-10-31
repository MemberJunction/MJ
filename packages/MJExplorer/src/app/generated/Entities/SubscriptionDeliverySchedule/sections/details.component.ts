import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { SubscriptionDeliveryScheduleEntity } from 'mj_generatedentities';

@RegisterClass(BaseFormSectionComponent, 'Subscription Delivery Schedules.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-subscriptiondeliveryschedule-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="SubscriptionID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Sequence"
            Type="numerictextbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="StartDate"
            Type="datepicker"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="EndDate"
            Type="datepicker"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="AddressID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="PhoneID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="FaxID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="Email"
            Type="textarea"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="RequestedByID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="DistributionTypeID"
            Type="numerictextbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Search"
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
            FieldName="DistributionType"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class SubscriptionDeliveryScheduleDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: SubscriptionDeliveryScheduleEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadSubscriptionDeliveryScheduleDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      