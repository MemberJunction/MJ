import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { CommunicationProviderMessageTypeEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Communication Provider Message Types.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-communicationprovidermessagetype-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="CommunicationProviderID"
            Type="textbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Dropdown"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="CommunicationBaseMessageTypeID"
            Type="textbox"
            [EditMode]="EditMode"
            LinkType="Record"
            LinkComponentType="Dropdown"
        ></mj-form-field>
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
            FieldName="Status"
            Type="dropdownlist"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="AdditionalAttributes"
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
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="CommunicationProvider"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>
        <mj-form-field 
            [record]="record"
            [ShowLabel]="true"
            FieldName="CommunicationBaseMessageType"
            Type="textbox"
            [EditMode]="EditMode"
        ></mj-form-field>

    </div>
</div>
    `
})
export class CommunicationProviderMessageTypeDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: CommunicationProviderMessageTypeEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadCommunicationProviderMessageTypeDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      